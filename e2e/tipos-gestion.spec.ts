import { test, expect } from "@playwright/test";

interface ApiTipo {
  id: string;
  nombre: string;
  recurso: string;
  activo: boolean;
}

interface ApiMedidor {
  id: string;
  codigo: string;
  tipoMedidorId: string;
}

interface WindowApi {
  medidores: {
    getTipos: (estado?: string) => Promise<ApiTipo[]>;
    createTipo: (payload: Record<string, unknown>) => Promise<ApiTipo>;
    updateTipo: (id: string, payload: Record<string, unknown>) => Promise<ApiTipo>;
    archivarTipo: (id: string) => Promise<ApiTipo>;
    deleteTipo: (id: string) => Promise<unknown>;
    create: (payload: Record<string, unknown>) => Promise<ApiMedidor>;
    update: (id: string, payload: Record<string, unknown>) => Promise<ApiMedidor>;
  };
  instalaciones: {
    getAll: (estado?: string) => Promise<Array<{ id: string; nombre: string }>>;
  };
}

interface AppWindow extends Window {
  api: WindowApi;
  cargarParqueAdmin: () => Promise<void>;
}

test.describe("E2E: Gestión de tipos con bloqueo por uso (feat-026)", () => {
  test.beforeEach(async ({ request, page }) => {
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
    await page.goto("/#/parque");
    await page.waitForSelector("#mainNavbar", { state: "visible" });
    await page.waitForFunction(() => document.body.dataset.appReady === "true");
    const quickAdmin = page.getByTestId("quick-role-admin");
    if (await quickAdmin.isVisible().catch(() => false)) {
      await quickAdmin.click();
      await page.waitForTimeout(300);
    }
    await page.getByTestId("nav-parque").click();
    await expect(page.getByTestId("view-parque")).toBeVisible();
  });

  test("debe bloquear la edición del tipo en uso y liberarlo tras reasignar", async ({ page }) => {
    const ts = Date.now().toString().slice(-6);
    const nombreA = `Tipo E2E A ${ts}`;
    const nombreB = `Tipo E2E B ${ts}`;

    const ids = await page.evaluate(async () => {
      const w = window as unknown as AppWindow;
      const suf = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000).toString();
      const insts = await w.api.instalaciones.getAll("activas");
      const instalacionId = insts[0].id;
      const tipoA = await w.api.medidores.createTipo({
        nombre: `Tipo E2E A ${suf}`,
        recurso: "AGUA",
        unidad: "LITROS",
        tipoMedicion: "ACUMULATIVO",
      });
      const tipoB = await w.api.medidores.createTipo({
        nombre: `Tipo E2E B ${suf}`,
        recurso: "AGUA",
        unidad: "LITROS",
        tipoMedicion: "ACUMULATIVO",
      });
      const med = await w.api.medidores.create({
        instalacionId,
        tipoMedidorId: tipoA.id,
        codigo: `MED-T26-${suf}`,
        ubicacionInterna: "Sala E2E T26",
      });
      return { instalacionId, tipoAId: tipoA.id, tipoBId: tipoB.id, medidorId: med.id };
    });
    void nombreA;
    void nombreB;

    // 1. Editar tipo en uso → 409 TIPO_MEDIDOR_EN_USO
    const bloqueo = await page.evaluate(async (args: { tipoAId: string }) => {
      const w = window as unknown as AppWindow;
      try {
        await w.api.medidores.updateTipo(args.tipoAId, { nombre: "Intento Renombre" });
        return { bloqueado: false, code: "" };
      } catch (e) {
        const err = e as { code?: string; details?: { error?: string } };
        return { bloqueado: true, code: err.details?.error ?? err.code ?? "" };
      }
    }, { tipoAId: ids.tipoAId });
    expect(bloqueo.bloqueado).toBe(true);
    expect(bloqueo.code).toContain("TIPO_MEDIDOR_EN_USO");

    // 2. Reasignar medidor al tipo B
    await page.evaluate(async (args: { medidorId: string; tipoBId: string }) => {
      const w = window as unknown as AppWindow;
      await w.api.medidores.update(args.medidorId, { tipoMedidorId: args.tipoBId });
    }, { medidorId: ids.medidorId, tipoBId: ids.tipoBId });

    // 3. Editar tipo liberado → ok (read-after-write)
    const renombrado = `Tipo E2E A Renombrado ${ts}`;
    await page.evaluate(async (args: { tipoAId: string; nombre: string }) => {
      const w = window as unknown as AppWindow;
      await w.api.medidores.updateTipo(args.tipoAId, { nombre: args.nombre });
    }, { tipoAId: ids.tipoAId, nombre: renombrado });
    const verificado = await page.evaluate(async (args: { tipoAId: string }) => {
      const w = window as unknown as AppWindow;
      const tipos = await w.api.medidores.getTipos("todos");
      return tipos.find((t) => t.id === args.tipoAId)?.nombre ?? "";
    }, { tipoAId: ids.tipoAId });
    expect(verificado).toBe(renombrado);

    // 4. La pestaña de tipos muestra el tipo renombrado
    await page.evaluate(async () => {
      const w = window as unknown as AppWindow;
      await w.cargarParqueAdmin();
    });
    await page.getByTestId("btn-parque-tab-tipos").click();
    await expect(page.locator("#viewParque #tbodyGestionTipos", { hasText: renombrado })).toBeVisible();
  });

  test("debe archivar y eliminar el tipo liberado, y rechazar eliminar el tipo en uso", async ({ page }) => {
    const ts = Date.now().toString().slice(-6);
    const ids = await page.evaluate(async () => {
      const w = window as unknown as AppWindow;
      const suf = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000).toString();
      const tipoLibre = await w.api.medidores.createTipo({
        nombre: `Tipo Libre ${suf}`,
        recurso: "LUZ",
        unidad: "KWH",
        tipoMedicion: "ACUMULATIVO",
      });
      const tipoOcupado = await w.api.medidores.createTipo({
        nombre: `Tipo Ocupado ${suf}`,
        recurso: "LUZ",
        unidad: "KWH",
        tipoMedicion: "ACUMULATIVO",
      });
      const insts = await w.api.instalaciones.getAll("activas");
      const med = await w.api.medidores.create({
        instalacionId: insts[0].id,
        tipoMedidorId: tipoOcupado.id,
        codigo: `MED-T26B-${suf}`,
        ubicacionInterna: "Sala E2E T26B",
      });
      return { tipoLibreId: tipoLibre.id, tipoOcupadoId: tipoOcupado.id, medidorId: med.id };
    });
    void ts;

    // Eliminar tipo en uso → 422
    const rechazo = await page.evaluate(async (args: { tipoOcupadoId: string }) => {
      const w = window as unknown as AppWindow;
      try {
        await w.api.medidores.deleteTipo(args.tipoOcupadoId);
        return { bloqueado: false, code: "" };
      } catch (e) {
        const err = e as { code?: string; details?: { error?: string } };
        return { bloqueado: true, code: err.details?.error ?? err.code ?? "" };
      }
    }, { tipoOcupadoId: ids.tipoOcupadoId });
    expect(rechazo.bloqueado).toBe(true);

    // Archivar tipo libre → ok; eliminar físico → ok (GET posterior 404)
    await page.evaluate(async (args: { tipoLibreId: string }) => {
      const w = window as unknown as AppWindow;
      await w.api.medidores.archivarTipo(args.tipoLibreId);
    }, { tipoLibreId: ids.tipoLibreId });
    const archivados = await page.evaluate(async () => {
      const w = window as unknown as AppWindow;
      return w.api.medidores.getTipos("archivados");
    });
    expect(archivados.some((t) => t.id === ids.tipoLibreId)).toBe(true);
    await page.evaluate(async (args: { tipoLibreId: string }) => {
      const w = window as unknown as AppWindow;
      await w.api.medidores.deleteTipo(args.tipoLibreId);
    }, { tipoLibreId: ids.tipoLibreId });
    const trasBorrar = await page.evaluate(async () => {
      const w = window as unknown as AppWindow;
      return w.api.medidores.getTipos("todos");
    });
    expect(trasBorrar.some((t) => t.id === ids.tipoLibreId)).toBe(false);
  });
});
