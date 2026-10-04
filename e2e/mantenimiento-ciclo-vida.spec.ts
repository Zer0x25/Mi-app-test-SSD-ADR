import { test, expect } from "@playwright/test";

test.describe("E2E: Ciclo de Vida Metrológico, Bajas Técnicas y Pistas de Auditoría", () => {
  test.beforeEach(async ({ page, request }) => {
    // Resetear a estado limpio con seed
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();

    await page.goto("/");
    await page.waitForSelector("#mainNavbar", { state: "visible" });
  });

  test("debe registrar una baja técnica con lectura de retiro, reflejarla en la bitácora y generar auditoría inmutable", async ({ page }) => {
    // 1. Navegar a Mantenimiento
    await page.click("#tabMantenimientoBtn");
    await expect(page.locator("#viewMantenimiento")).toBeVisible();

    // 2. Abrir modal de mantenimiento
    await page.click("#btnOpenModalMantenimiento");
    const modal = page.locator("#modalRegistrarMantenimiento");
    await expect(modal).toHaveClass(/open/);

    // 3. Esperar que se carguen las opciones y seleccionar medidor para baja técnica
    const selectMedidor = page.locator("#mantMedidorId");
    await expect(page.locator("#mantMedidorId option:not([value=''])").first()).toBeAttached({ timeout: 10000 });
    const options = await selectMedidor.locator("option").all();
    let selected = false;
    for (const opt of options) {
      const text = await opt.innerText();
      if (text.includes("MED-GAS-CORP-01")) {
        const val = await opt.getAttribute("value");
        if (val) {
          await selectMedidor.selectOption(val);
          selected = true;
          break;
        }
      }
    }
    if (!selected) {
      await selectMedidor.selectOption({ index: 1 });
    }

    // 4. Seleccionar tipo de intervención: BAJA_TECNICA
    const selectTipo = page.locator("#mantTipo");
    await selectTipo.selectOption("BAJA_TECNICA");

    // Verificar que la sección de baja se despliega
    const seccionBaja = page.locator("#mantSeccionBaja");
    await expect(seccionBaja).toBeVisible();

    // 5. Completar campos técnicos
    const timestamp = Date.now().toString().slice(-4);
    const tecnico = `Ing. Inspector E2E ${timestamp}`;
    await page.locator("#mantTecnico").fill(tecnico);
    await page.locator("#mantLecturaRetiro").fill("999999");
    await page.locator("#mantObservaciones").fill("Baja técnica por deterioro de rotor e inexactitud metrológica.");

    // 6. Enviar formulario
    await page.locator("#formRegistrarMantenimiento button[type='submit']").click();

    // Validar toast de éxito y cierre del modal
    await expect(page.locator(".toast-success", { hasText: "Intervención registrada" })).toBeVisible();
    await expect(modal).not.toHaveClass(/open/);

    // 7. Verificar que la bitácora técnica de mantenimiento contenga el registro con badge BAJA
    const tbodyMantenimiento = page.locator("#tbodyMantenimientosBitacora");
    await expect(tbodyMantenimiento).toContainText(tecnico);
    await expect(tbodyMantenimiento).toContainText("BAJA");

    // 8. Navegar a Auditoría & Seguridad para verificar la pista inmutable (Append-Only)
    await page.locator("#tabAuditoriaBtn").click();
    await expect(page.locator("#viewAuditoria")).toBeVisible();

    // Filtrar por acción BAJA_MEDIDOR
    const filtroAuditoria = page.locator("#filtroAuditoriaAccion");
    await filtroAuditoria.selectOption("BAJA_MEDIDOR");
    await page.waitForTimeout(400);

    // Verificar que el evento de auditoría se muestre en la bitácora
    const tbodyAuditoria = page.locator("#tbodyAuditoria");
    await expect(tbodyAuditoria).toContainText("Baja Medidor");
    await expect(tbodyAuditoria).toContainText("BAJA_TECNICA");
  });
});
