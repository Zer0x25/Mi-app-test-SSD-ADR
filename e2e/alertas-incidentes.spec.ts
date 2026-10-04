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

  test("debe permitir configurar una nueva regla dinámica de alerta y reflejarla en la tabla de reglas activas", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#mainNavbar", { state: "visible" });

    // 1. Navegar a Alertas
    await page.click("#tabAlertasBtn");
    await expect(page.locator("#viewAlertas")).toBeVisible();

    // 2. Abrir modal de configuración de reglas
    await page.click("button:has-text('Ver / Crear Reglas')");
    const modalReglas = page.locator("#modalConfigurarReglas");
    await expect(modalReglas).toHaveClass(/open/);

    // 3. Completar formulario de nueva regla
    const timestamp = Date.now().toString().slice(-4);
    const nombreRegla = `Alerta Eléctrica Crítica ${timestamp}`;
    await page.locator("#reglaNombre").fill(nombreRegla);
    await page.locator("#reglaTipo").selectOption("SALTO_CONSUMO");
    await page.locator("#reglaRecurso").selectOption("LUZ");
    await page.locator("#reglaUmbral").fill("75.5");

    // 4. Enviar formulario
    await page.locator("#formCrearRegla button[type='submit']").click();

    // Validar toast de éxito
    await expect(page.locator(".toast-success", { hasText: "Regla de alerta creada exitosamente" })).toBeVisible();

    // 5. Verificar que la tabla de reglas activas contenga la nueva regla
    const tbodyReglas = page.locator("#tbodyReglasAlertas");
    await expect(tbodyReglas).toContainText(nombreRegla);
    await expect(tbodyReglas).toContainText("75.5");

    // Cerrar modal
    await page.locator("#modalConfigurarReglas button:has-text('Cerrar')").click();
    await expect(modalReglas).not.toHaveClass(/open/);
  });
});

