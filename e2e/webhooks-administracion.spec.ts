import { test, expect } from "@playwright/test";

test.describe("Flujo E2E: Administración y Diagnóstico de Webhooks Salientes", () => {
  test.beforeEach(async ({ request }) => {
    // Restaurar base de datos con datos demo limpios
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("debe permitir crear endpoint, ejecutar test ping, revisar logs de entrega y gestionar ciclo de vida", async ({ page }) => {
    await page.goto("/");

    // 1. Navegar a la pestaña de Webhooks como ADMIN
    await page.click("#tabWebhooksBtn");
    await expect(page.locator("#viewWebhooks")).toBeVisible();
    await expect(page.locator("#headingWebhooks")).toContainText("Integraciones & Despacho de Webhooks");

    // 2. Abrir modal de nuevo webhook
    await page.click("button:has-text('Nuevo Webhook')");
    const modalNuevo = page.locator("#modalNuevoWebhook");
    await expect(modalNuevo).toBeVisible();

    // 3. Completar formulario con URL de prueba y secreto HMAC
    const testUrl = "http://127.0.0.1:3000/api/health";
    const descripcion = `Receptor E2E ${Date.now()}`;
    await page.fill("#webhookUrl", testUrl);
    await page.fill("#webhookDescripcion", descripcion);
    await page.fill("#webhookSecret", "secreto_seguro_e2e_123");

    // Enviar formulario
    await page.click("#modalNuevoWebhook button[type='submit']");

    // Verificar toast y cierre del modal
    const toastSuccess = page.locator(".toast-success");
    await expect(toastSuccess.first()).toBeVisible();
    await expect(modalNuevo).toBeHidden();

    // 4. Verificar que aparece listado en la tabla de endpoints
    const filaWebhook = page.locator("#tbodyWebhooks tr", { hasText: descripcion });
    await expect(filaWebhook).toBeVisible();
    await expect(filaWebhook).toContainText(testUrl);

    // 5. Ejecutar Ping de prueba sintético (botón ⚡ Test)
    await filaWebhook.locator("button:has-text('Test')").click();
    const pingToast = page.locator(".toast-info, .toast-success");
    await expect(pingToast.first()).toBeVisible();

    // 6. Consultar historial de entregas (botón 📋 Logs)
    await filaWebhook.locator("button:has-text('Logs')").click();
    const modalLogs = page.locator("#modalEntregasWebhook");
    await expect(modalLogs).toBeVisible();

    // Verificar que se listan entregas con código HTTP y fecha
    const filasEntregas = page.locator("#tbodyEntregasWebhook tr");
    await expect(filasEntregas.first()).toBeVisible();
    await expect(page.locator("#tbodyEntregasWebhook")).toContainText("test.ping");
    await expect(page.locator("#tbodyEntregasWebhook")).toContainText("200");

    // Cerrar modal de logs
    await page.click("#modalEntregasWebhook button:has-text('Cerrar')");
    await expect(modalLogs).toBeHidden();

    // 7. Pausar / Desactivar el endpoint
    await filaWebhook.locator("button[title*='Pausar']").click();
    await expect(page.locator(".toast-info, .toast-success").first()).toBeVisible();

    // 8. Eliminar endpoint (manejando el confirm dialog del navegador)
    page.once("dialog", (dialog) => dialog.accept());
    await filaWebhook.locator("button[title*='Eliminar']").click();
    await expect(page.locator(".toast-success").first()).toBeVisible();

    // Verificar que ya no está presente en la tabla
    await expect(page.locator("#tbodyWebhooks", { hasText: descripcion })).toBeHidden();
  });
});
