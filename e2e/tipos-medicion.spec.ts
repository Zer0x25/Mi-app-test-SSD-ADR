import { test, expect } from "@playwright/test";

test.describe("E2E: Tipos de medición con multiplicador, nivel y recarga (feat-024)", () => {
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

  test("debe crear un tipo NIVEL con factor y capacidad y ofrecerlo en el alta de medidores", async ({ page }) => {
    const ts = Date.now();
    const nombreTipo = `Tanque E2E ${ts}`;

    await page.getByTestId("btn-nueva-instalacion").isHidden().catch(() => false);
    await page.getByTestId("btn-nuevo-tipo").click();
    await expect(page.getByTestId("modal-tipo")).toHaveAttribute("data-state", "open");

    await page.locator("#inputTipoNombre").fill(nombreTipo);
    await page.locator("#selectTipoRecurso").selectOption("PETROLEO");
    await page.locator("#inputTipoUnidad").fill("LITROS");
    await page.locator("#selectTipoMedicion").selectOption("NIVEL");
    await page.locator("#inputTipoMultiplicador").fill("2");
    await page.locator("#inputTipoCapacidad").fill("5000");
    await page.locator("#formTipo button[type='submit']").click();

    await expect(page.locator(".toast-success", { hasText: nombreTipo })).toBeVisible();
    await expect(page.getByTestId("modal-tipo")).toHaveAttribute("data-state", "closed");

    await page.getByTestId("btn-nuevo-medidor").click();
    await expect(page.locator("#selectMedidorTipo")).toContainText(nombreTipo);
    await page.locator("#modalMedidor .btn-close").click();
  });

  test("ciclo tanque: bajada ok, exceso sobre capacidad rechazado y recarga en bitácora", async ({ page }) => {
    const ts = Date.now();
    const nombreTipo = `Tanque Ciclo ${ts}`;
    const codigoMed = `MED-TANQ-${ts.toString().slice(-6)}`;

    // 1. Tipo NIVEL capacidad 100
    await page.getByTestId("btn-nuevo-tipo").click();
    await page.locator("#inputTipoNombre").fill(nombreTipo);
    await page.locator("#selectTipoRecurso").selectOption("PETROLEO");
    await page.locator("#inputTipoUnidad").fill("LITROS");
    await page.locator("#selectTipoMedicion").selectOption("NIVEL");
    await page.locator("#inputTipoMultiplicador").fill("1");
    await page.locator("#inputTipoCapacidad").fill("100");
    await page.locator("#formTipo button[type='submit']").click();
    await expect(page.locator(".toast-success", { hasText: nombreTipo })).toBeVisible();

    // 2. Medidor con ese tipo en la primera instalación
    await page.getByTestId("btn-nuevo-medidor").click();
    const selInst = page.locator("#selectMedidorInstalacion");
    await expect(selInst.locator("option").nth(1)).toBeAttached({ timeout: 10000 });
    await selInst.selectOption({ index: 1 });
    const instalacionId = await selInst.inputValue();
    const selTipo = page.locator("#selectMedidorTipo");
    await selTipo.selectOption({ label: `${nombreTipo} (PETROLEO - LITROS)` }).catch(async () => {
      const opts = await selTipo.locator("option").all();
      for (const o of opts) {
        if (((await o.innerText()) || "").includes(nombreTipo)) {
          const v = await o.getAttribute("value");
          if (v) { await selTipo.selectOption(v); break; }
        }
      }
    });
    await page.locator("#inputMedidorCodigo").fill(codigoMed);
    await page.locator("#inputMedidorUbicacion").fill("Patio Tanques E2E");
    await page.locator("#formMedidor button[type='submit']").click();
    await expect(page.locator(".toast-success", { hasText: codigoMed })).toBeVisible();

    // 3. Modo Terreno como ADMIN: seleccionar la misma instalación y abrir lectura
    await page.getByTestId("nav-operador").click();
    await expect(page.getByTestId("view-operador")).toBeVisible();
    const selOp = page.locator("#selectOperadorInstalacion");
    await selOp.selectOption(instalacionId);
    await page.waitForTimeout(500);
    const card = page.locator("#gridMedidoresOperador .meter-card", { hasText: codigoMed });
    await expect(card).toBeVisible();
    await card.locator("button:has-text('Registrar Lectura')").click();
    const modalLec = page.locator("#modalLectura");
    await expect(modalLec).toBeVisible();

    // Bajada válida 80/100 con fecha explícita pasada
    await page.locator("#modalLecturaInputValor").fill("80");
    await page.locator("#modalLecturaInputFecha").fill("2026-09-01T08:00");
    await page.locator("#formLectura button[type='submit']").click();
    await expect(page.locator(".toast-success").first()).toBeVisible();
    await expect(modalLec).toBeHidden();

    // Exceso 150 > capacidad 100 debe rechazarse y mantener el modal abierto
    await card.locator("button:has-text('Registrar Lectura')").click();
    await expect(modalLec).toBeVisible();
    await page.locator("#modalLecturaInputValor").fill("150");
    await page.locator("#modalLecturaInputFecha").fill("2026-09-02T08:00");
    await page.locator("#formLectura button[type='submit']").click();
    await expect(page.locator(".toast-error").first()).toBeVisible();
    await expect(modalLec).toBeVisible();
    await page.locator("#modalLectura .btn-close").click();

    // 4. Recarga desde Mantenimiento y verificación en bitácora
    await page.getByTestId("nav-mantenimiento").click();
    await expect(page.getByTestId("view-mantenimiento")).toBeVisible();
    await page.getByTestId("btn-registrar-mantenimiento").click();
    await expect(page.getByTestId("modal-registrar-mantenimiento")).toHaveAttribute("data-state", "open");
    const selMant = page.locator("#mantMedidorId");
    await expect(selMant.locator("option", { hasText: codigoMed }).first()).toBeAttached({ timeout: 10000 });
    const mantOpts = await selMant.locator("option").all();
    for (const o of mantOpts) {
      if (((await o.innerText()) || "").includes(codigoMed)) {
        const v = await o.getAttribute("value");
        if (v) { await selMant.selectOption(v); break; }
      }
    }
    await page.locator("#mantTipo").selectOption("RECARGA_TANQUE");
    await page.locator("#mantTecnico").fill("Operador Combustible E2E");
    await page.locator("#mantVolumenRecargado").fill("40");
    await page.locator("#mantNivelPosterior").fill("95");
    await page.locator("#formRegistrarMantenimiento button[type='submit']").click();
    await expect(page.locator(".toast-success").first()).toBeVisible();
    await expect(page.locator("#tbodyMantenimientosBitacora", { hasText: codigoMed })).toContainText("RECARGA");
  });
});
