import { test, expect } from "@playwright/test";

test.describe("Flujo E2E: Auditoría Inmutable y Respaldo en Caliente", () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("debe cargar la bitácora inmutable de auditoría y permitir filtrar por acción", async ({ page }) => {
    await page.goto("/");

    // 1. Navegar a pestaña Auditoría
    await page.click("#tabAuditoriaBtn");
    await expect(page.locator("#viewAuditoria")).toBeVisible();
    await expect(page.locator("#headingAuditoria")).toContainText("Pista de Auditoría");

    // 2. Verificar que la tabla de auditoría renderiza eventos
    const tbody = page.locator("#tbodyAuditoria");
    await expect(tbody).toBeVisible();
    await expect(tbody.locator("tr")).not.toHaveCount(0);

    // 3. Probar selector de filtro de acciones
    await page.selectOption("#filtroAuditoriaAccion", "");
    await expect(tbody).toBeVisible();
  });

  test("debe permitir a ADMIN disparar un respaldo atómico en caliente y reflejarlo en la bitácora", async ({ page }) => {
    await page.goto("/");

    await page.click("#tabAuditoriaBtn");
    await expect(page.locator("#viewAuditoria")).toBeVisible();

    // 1. Localizar y presionar el botón Generar Respaldo
    const btnBackup = page.locator("#btnGenerarBackup");
    await expect(btnBackup).toBeVisible();
    await btnBackup.click();

    // 2. Validar notificación Toast con información del snapshot generado
    const successToast = page.locator(".toast-success");
    await expect(successToast.first()).toBeVisible({ timeout: 10000 });
    await expect(successToast.first()).toContainText(/Snapshot creado|\.db/);

    // 3. Validar que la bitácora de auditoría se actualiza automáticamente con el evento
    const tbody = page.locator("#tbodyAuditoria");
    await expect(tbody).toBeVisible();
    await expect(tbody).toContainText(/SISTEMA|BACKUP/);
  });
});
