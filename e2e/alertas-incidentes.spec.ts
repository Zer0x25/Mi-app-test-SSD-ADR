import { test, expect } from "@playwright/test";

test.describe("Flujo E2E: Detección y Resolución de Alertas e Incidentes", () => {
  test.beforeEach(async ({ request }) => {
    // Restaurar base de datos con datos demo limpios
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("debe permitir visualizar reglas, evaluar incidentes en vivo y resolver una anomalía", async ({ page }) => {
    await page.goto("/");

    // 1. Navegar a la pestaña de Alertas
    await page.click("#tabAlertasBtn");
    await expect(page.locator("#viewAlertas")).toBeVisible();
    await expect(page.locator("#headingAlertas")).toContainText("Centro de Alertas & Anomalías");

    // 2. Inspeccionar modal de reglas existentes
    await page.click("button:has-text('Ver / Crear Reglas')");
    const modalReglas = page.locator("#modalConfigurarReglas");
    await expect(modalReglas).toBeVisible();
    await expect(page.locator("#tablaReglasAlertas")).toContainText("SIN_REPORTE");
    await page.click("#modalConfigurarReglas button:has-text('Cerrar')");
    await expect(modalReglas).toBeHidden();

    // 3. Ejecutar evaluación de reglas en vivo
    await page.click("button:has-text('Evaluar Reglas Ahora')");

    // Verificar que aparece toast de resultado de evaluación
    const evalToast = page.locator(".toast-info, .toast-warning, .toast-success");
    await expect(evalToast.first()).toBeVisible();

    // 4. Esperar a que la tabla de incidentes cargue filas
    const btnAtender = page.locator("#tbodyAlertasIncidentes button:has-text('Atender')").first();
    await expect(btnAtender).toBeVisible({ timeout: 10000 });

    // 5. Abrir modal para atender el incidente
    await btnAtender.click();
    const modalResolver = page.locator("#modalResolverIncidente");
    await expect(modalResolver).toBeVisible();

    // Verificar que contiene mensaje de anomalía descriptivo
    const mensajeIncidente = await page.locator("#resolverIncidenteMensaje").innerText();
    expect(mensajeIncidente.length).toBeGreaterThan(0);

    // 6. Seleccionar estado RESUELTO y redactar bitácora
    await page.selectOption("#resolverEstado", "RESUELTO");
    await page.fill("#resolverNotas", "Inspección técnica en terreno concluida. Se normalizó la telemetría.");

    // Guardar resolución
    await page.click("#formResolverIncidente button[type='submit']");

    // Verificar toast de éxito y cierre de modal
    const successToast = page.locator(".toast-success");
    await expect(successToast.first()).toBeVisible();
    await expect(modalResolver).toBeHidden();

    // 7. Filtrar por estado 'Resueltos' y verificar que el incidente figura cerrado
    await page.selectOption("#filtroAlertasEstado", "RESUELTO");
    await expect(page.locator("#tbodyAlertasIncidentes")).toContainText("RESUELTO");
  });
});
