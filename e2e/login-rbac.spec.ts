import { test, expect } from "@playwright/test";

test.describe("Flujo E2E: Autenticación y Control de Acceso RBAC", () => {
  test.beforeEach(async ({ request }) => {
    // Inicializar base de datos con datos demo limpios
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("debe cargar la aplicación y mostrar sesión ADMIN por defecto con acceso completo", async ({ page }) => {
    await page.goto("/");

    // 1. Validar título y branding
    await expect(page).toHaveTitle(/Sistema Medidores/);
    await expect(page.locator(".brand-title")).toHaveText("Sistema Medidores");

    // 2. Verificar que el usuario activo sea Administrador
    const userPill = page.locator("#navUserPill");
    await expect(userPill).toBeVisible();
    await expect(userPill).toContainText("ADMIN");
    await expect(userPill).toContainText("Administrador Central");

    // 3. Verificar visibilidad de todas las pestañas de navegación para ADMIN
    await expect(page.locator("#tabAdminBtn")).toBeVisible();
    await expect(page.locator("#tabReportesBtn")).toBeVisible();
    await expect(page.locator("#tabAlertasBtn")).toBeVisible();
    await expect(page.locator("#tabMantenimientoBtn")).toBeVisible();
    await expect(page.locator("#tabUsuariosBtn")).toBeVisible();
    await expect(page.locator("#tabAuditoriaBtn")).toBeVisible();
    await expect(page.locator("#tabWebhooksBtn")).toBeVisible();
    await expect(page.locator("#tabOperadorBtn")).toBeVisible();

    // 4. Verificar botones de acción administrativa en Dashboard
    await expect(page.locator("#btnOpenModalMedidor")).toBeVisible();
    await expect(page.locator("#btnOpenModalInstalacion")).toBeVisible();
    await expect(page.locator("#btnOpenModalTipo")).toBeVisible();
  });

  test("debe conmutar a rol OPERADOR, activando Modo Terreno y restringiendo módulos administrativos", async ({ page }) => {
    await page.goto("/");

    // Conmutar a Operador
    await page.click("#quickRoleOperador");

    // Verificar notificación Toast o píldora de usuario
    const userPill = page.locator("#navUserPill");
    await expect(userPill).toContainText("OPERADOR");
    await expect(userPill).toContainText("Juan Operador Terreno");

    // Verificar que la vista activa pasa automáticamente a Modo Terreno
    await expect(page.locator("#viewOperador")).toBeVisible();
    await expect(page.locator("#headingOperador")).toHaveText("Ingreso de Lecturas en Terreno");

    // Verificar que los accesos privilegiados quedan ocultos para el Operador
    await expect(page.locator("#tabWebhooksBtn")).toBeHidden();
    await expect(page.locator("#tabUsuariosBtn")).toBeHidden();
    await expect(page.locator("#tabAuditoriaBtn")).toBeHidden();
    await expect(page.locator("#tabAdminBtn")).toBeHidden();
  });

  test("debe conmutar a rol SUPERVISOR, permitiendo dashboard pero restringiendo administración global", async ({ page }) => {
    await page.goto("/");

    // Conmutar a Supervisor
    await page.click("#quickRoleSupervisor");

    // Verificar píldora
    const userPill = page.locator("#navUserPill");
    await expect(userPill).toContainText("SUPERVISOR");
    await expect(userPill).toContainText("Carlos Supervisor");

    // Supervisor no tiene acceso a Webhooks ni a crear instalaciones
    await expect(page.locator("#tabWebhooksBtn")).toBeHidden();
    await expect(page.locator("#btnOpenModalInstalacion")).toBeHidden();

    // Pero sí ve Dashboard y Reportes
    await expect(page.locator("#tabAdminBtn")).toBeVisible();
    await expect(page.locator("#tabReportesBtn")).toBeVisible();
  });
});
