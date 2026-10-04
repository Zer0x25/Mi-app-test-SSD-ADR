import { test, expect } from "@playwright/test";

test.describe("E2E: Robustez de UI, Estados Vacíos (Empty States) y Cero Excepciones JS", () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("debe navegar por todos los módulos y manejar filtros sin resultados sin lanzar excepciones en consola", async ({ page }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err);
    });

    await page.goto("/");
    await page.waitForSelector("#mainNavbar", { state: "visible" });

    // 1. Navegar por los 9 módulos principales y comprobar visibilidad sin errores
    const tabs = [
      { btn: "#tabReportesBtn", view: "#viewReportes" },
      { btn: "#tabAlertasBtn", view: "#viewAlertas" },
      { btn: "#tabMantenimientoBtn", view: "#viewMantenimiento" },
      { btn: "#tabUsuariosBtn", view: "#viewUsuarios" },
      { btn: "#tabAuditoriaBtn", view: "#viewAuditoria" },
      { btn: "#tabWebhooksBtn", view: "#viewWebhooks" },
      { btn: "#tabNotificacionesBtn", view: "#viewNotificaciones" },
      { btn: "#tabOperadorBtn", view: "#viewOperador" },
      { btn: "#tabAdminBtn", view: "#viewAdmin" },
    ];

    for (const tab of tabs) {
      await page.click(tab.btn);
      await expect(page.locator(tab.view)).toBeVisible();
      await page.waitForTimeout(100);
    }

    // 2. Probar estado vacío en Reportes con fechas fuera de rango
    await page.click("#tabReportesBtn");
    await page.fill("#filtroReporteInicio", "2010-01-01");
    await page.fill("#filtroReporteFin", "2010-01-02");
    await page.click("#viewReportes button:has-text('Filtrar')");
    await page.waitForTimeout(300);

    // Debe mostrar fila con clase empty-state sin fallar
    const tbodyReportes = page.locator("#tbodyReporteConsumos");
    await expect(tbodyReportes.locator(".empty-state")).toBeVisible();

    // 3. Probar filtro sin resultados en Auditoría
    await page.click("#tabAuditoriaBtn");
    await page.selectOption("#filtroAuditoriaAccion", "RESET_PASSWORD_ADMIN");
    await page.waitForTimeout(300);

    const tbodyAuditoria = page.locator("#tbodyAuditoria");
    await expect(tbodyAuditoria).toBeVisible();

    // 4. Invariante: Cero excepciones no controladas en el runtime del cliente
    expect(pageErrors).toEqual([]);
  });
});
