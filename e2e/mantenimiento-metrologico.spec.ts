import { test, expect } from "@playwright/test";

test.describe("Flujo E2E: Mantenimiento, Calibraciones y Precintos", () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("debe cargar la bitácora general de mantenimiento y permitir registrar una calibración", async ({ page }) => {
    await page.goto("/");

    // 1. Navegar a pestaña Mantenimiento
    await page.click("#tabMantenimientoBtn");
    await expect(page.locator("#viewMantenimiento")).toBeVisible();
    await expect(page.locator("#headingMantenimiento")).toContainText("Mantenimiento, Calibración");

    // 2. Abrir modal de nuevo mantenimiento
    await page.click("#viewMantenimiento button:has-text('Registrar Mantenimiento')");
    const modal = page.locator("#modalRegistrarMantenimiento");
    await expect(modal).toBeVisible();

    // 3. Completar formulario de mantenimiento
    const selectMedidor = page.locator("#mantMedidorId");
    // Esperar a que se carguen las opciones reales del backend
    await expect(page.locator("#mantMedidorId option:not([value=''])").first()).toBeAttached({ timeout: 10000 });
    await selectMedidor.selectOption({ index: 1 });

    await page.selectOption("#mantTipo", "CALIBRACION");
    await page.fill("#mantFecha", "2026-10-04T10:00");
    await page.fill("#mantTecnico", "Laboratorio Metrológico Certificado");
    await page.fill("#mantPrecintoNuevo", "PREC-E2E-999");
    await page.fill("#mantProxCalib", "2027-10-04");
    await page.fill("#mantObservaciones", "Calibración anual conforme a norma técnica.");

    // 4. Guardar en bitácora
    await page.click("#formRegistrarMantenimiento button[type='submit']");

    // 5. Validar feedback visual y cierre de modal
    await expect(modal).toBeHidden();
    const successToast = page.locator(".toast-success");
    await expect(successToast.first()).toBeVisible();

    // 6. Verificar que la bitácora general incluye el nuevo registro
    const tbodyBitacora = page.locator("#tbodyMantenimientosBitacora");
    await expect(tbodyBitacora).toBeVisible();
    await expect(tbodyBitacora).toContainText("Laboratorio Metrológico Certificado");
    await expect(tbodyBitacora).toContainText("PREC-E2E-999");
  });

  test("debe permitir consultar la ficha metrológica individual de un medidor", async ({ page }) => {
    await page.goto("/");

    await page.click("#tabMantenimientoBtn");
    await expect(page.locator("#viewMantenimiento")).toBeVisible();

    // Seleccionar un medidor en el selector de ficha
    const selectFicha = page.locator("#selectFichaMedidor");
    await expect(page.locator("#selectFichaMedidor option:not([value=''])").first()).toBeAttached({ timeout: 10000 });
    await selectFicha.selectOption({ index: 1 });

    // Validar que el contenedor de ficha despliega la información metrológica
    const contenedorFicha = page.locator("#contenedorFichaMedidor");
    await expect(contenedorFicha).toBeVisible();
    await expect(contenedorFicha).not.toContainText("Selecciona un medidor para inspeccionar");
    await expect(contenedorFicha).toContainText("Precinto de Seguridad Actual:");
    await expect(contenedorFicha).toContainText("Última Calibración:");
  });
});
