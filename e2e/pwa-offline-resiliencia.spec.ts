import { test, expect } from "@playwright/test";

interface AppWindow {
  api: {
    instalaciones: {
      getAll: () => Promise<Array<{ id: string; nombre: string }>>;
    };
    medidores: {
      getByInstalacion: (id: string) => Promise<Array<{
        id: string;
        codigo: string;
        ultimaLectura?: { valor?: number };
      }>>;
    };
  };
  getCurrentUser: () => { id: string };
  syncManager: {
    encolarLectura: (data: Record<string, unknown>, codigo: string) => void;
    sincronizar: () => Promise<unknown>;
    verificarSaludBackend: () => Promise<unknown>;
  };
}

test.describe("Flujo E2E: Resiliencia PWA, Detección de Red y Sincronización Fuera de Línea", () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("debe detectar cambio de conectividad y actualizar el indicador de estado de red", async ({ page }) => {
    await page.goto("/");

    const badge = page.locator("#networkStatusBadge");
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("En línea");

    // 1. Simular pérdida de conectividad
    await page.context().setOffline(true);
    // Disparar evento offline en window para activar los listeners del navegador
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // 2. Verificar que el badge pasa a Modo Offline
    await expect(badge).toContainText("Modo Offline");
    await expect(badge).toHaveClass(/offline/);

    // 3. Simular recuperación de conectividad
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // 4. Verificar retorno a estado En línea
    await expect(badge).toContainText("En línea");
    await expect(badge).toHaveClass(/online/);
  });

  test("debe encolar lecturas en modo offline y sincronizarlas automáticamente al reconectar", async ({ page }) => {
    await page.goto("/");

    // 1. Conmutar a Operador en Terreno mientras estamos en línea
    await page.click("#quickRoleOperador");
    await expect(page.locator("#viewOperador")).toBeVisible();

    // 2. Obtener un medidor asignado en Edificio Corporativo con valor incremental
    const medidorInfo = await page.evaluate(async () => {
      const win = window as unknown as AppWindow;
      const instalaciones = await win.api.instalaciones.getAll();
      const instCorp = instalaciones.find((i: { nombre: string }) => i.nombre.includes("Corporativo")) || instalaciones[instalaciones.length - 1];
      const medidores = await win.api.medidores.getByInstalacion(instCorp.id);
      const med = medidores[0];
      const ultima = (med.ultimaLectura && med.ultimaLectura.valor) ? med.ultimaLectura.valor : 100;
      return { id: med.id, codigo: med.codigo, valor: ultima + 50.0 };
    });

    expect(medidorInfo.id).toBeDefined();

    // 3. Simular pérdida de red
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));

    // 4. Registrar una lectura fuera de línea en el SyncManager usando el usuario autenticado
    await page.evaluate((med) => {
      const win = window as unknown as AppWindow;
      const user = win.getCurrentUser();
      win.syncManager.encolarLectura({
        medidorId: med.id,
        operadorId: user.id,
        valor: med.valor,
        observaciones: "Lectura offline sintética E2E",
      }, med.codigo);
    }, medidorInfo);

    // 5. Validar que el botón de sincronización muestra pendientes
    const btnSync = page.locator("#syncQueueBtn");
    const countBadge = page.locator("#syncQueueCount");
    await expect(btnSync).toBeVisible();
    await expect(countBadge).toHaveText("1");

    // 6. Restablecer red y simular evento online
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));

    // 7. Forzar sincronización si el auto-timer no ha disparado aún
    await page.evaluate(() => (window as unknown as AppWindow).syncManager.sincronizar());

    // 8. Verificar que la cola se vacía exitosamente
    await expect(btnSync).toBeHidden({ timeout: 10000 });
  });

  test("debe mostrar Sin servidor si el backend cae con red local OK (feat-027, healthcheck real)", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => document.body.dataset.appReady === "true");

    const badge = page.locator("#networkStatusBadge");
    await expect(badge).toContainText("En línea", { timeout: 10000 });

    // 1. Simular caída del backend con red local OK (el SW jamás debe servir /readyz cacheado)
    await page.route("**/readyz", (route) => route.abort("failed"));
    await page.evaluate(() => (window as unknown as AppWindow).syncManager.verificarSaludBackend());

    // 2. El badge pasa a Sin servidor (no se queda en En línea ni cae a Modo Offline)
    await expect(badge).toContainText("Sin servidor", { timeout: 10000 });
    await expect(badge).toHaveClass(/degraded/);

    // 3. Al recuperar el backend, vuelve a En línea
    await page.unroute("**/readyz");
    await page.evaluate(() => (window as unknown as AppWindow).syncManager.verificarSaludBackend());
    await expect(badge).toContainText("En línea", { timeout: 10000 });
    await expect(badge).toHaveClass(/online/);
  });
});
