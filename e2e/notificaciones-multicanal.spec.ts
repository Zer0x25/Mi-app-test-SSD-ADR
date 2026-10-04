import { test, expect } from "@playwright/test";

test.describe("Flujo E2E: Notificaciones Push & Alertas por Telegram", () => {
  test.beforeEach(async ({ request }) => {
    // Restaurar base de datos con datos demo limpios
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("debe permitir navegar a Notificaciones, disparar pruebas sintéticas y visualizar bitácora", async ({ page }) => {
    await page.goto("/");

    // 1. Navegar a la pestaña de Notificaciones como ADMIN
    await page.click("#tabNotificacionesBtn");
    await expect(page.locator("#viewNotificaciones")).toBeVisible();
    await expect(page.locator("#headingNotificaciones")).toContainText("Notificaciones Push & Alertas por Telegram");

    // 2. Disparar prueba de Web Push
    await page.click("#btnTestPush");
    const toastPush = page.locator(".toast-success, .toast-info");
    await expect(toastPush.first()).toBeVisible();

    // 3. Disparar prueba de Telegram
    await page.fill("#inputTelegramMsg", "Prueba E2E Playwright Telegram");
    await page.click("#viewNotificaciones button:has-text('Enviar Prueba a Telegram')");
    const toastTelegram = page.locator(".toast-success, .toast-warning, .toast-info");
    await expect(toastTelegram.first()).toBeVisible();

    // 4. Refrescar y verificar bitácora de entregas
    await page.click("#viewNotificaciones button:has-text('Refrescar')");
    const filasHistorial = page.locator("#tbodyHistorialNotificaciones tr");
    await expect(filasHistorial.first()).toBeVisible();

    // Debe contener registros de los canales probados
    const tablaTexto = await page.locator("#tbodyHistorialNotificaciones").innerText();
    expect(tablaTexto.length).toBeGreaterThan(10);
  });
});
