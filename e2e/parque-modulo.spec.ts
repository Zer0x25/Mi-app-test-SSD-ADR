import { test, expect } from "@playwright/test";

test.describe("E2E: Modulo Parque independiente y Dashboard informativo (feat-023)", () => {
  test.beforeEach(async ({ request, page }) => {
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
    await page.goto("/#/dashboard");
    await page.waitForSelector("#mainNavbar", { state: "visible" });
    await page.waitForFunction(() => document.body.dataset.appReady === "true");
    const quickAdmin = page.getByTestId("quick-role-admin");
    if (await quickAdmin.isVisible().catch(() => false)) {
      await quickAdmin.click();
      await page.waitForTimeout(300);
    }
  });

  test("CA-1: dashboard es puramente informativo (sin altas ni gestion de parque)", async ({ page }) => {
    await page.goto("/#/dashboard");
    await expect(page.getByTestId("view-admin")).toBeVisible();
    // KPIs informativos siguen presentes
    await expect(page.locator("#kpiTotalInstalaciones")).toBeVisible();
    await expect(page.locator("#listaDesatendidos")).toBeVisible();
    await expect(page.locator("#listaConsumos")).toBeVisible();
    await expect(page.locator("#listaActividadReciente")).toBeVisible();
    // Parque NO existe dentro del dashboard
    await expect(page.locator("#viewAdmin #seccionGestionParque")).toHaveCount(0);
    await expect(page.locator("#viewAdmin #tablaGestionInstalaciones")).toHaveCount(0);
    await expect(page.locator("#viewAdmin #tablaGestionMedidores")).toHaveCount(0);
    // Botones de alta NO existen en dashboard
    await expect(page.locator("#viewAdmin #btnOpenModalMedidor")).toHaveCount(0);
    await expect(page.locator("#viewAdmin #btnOpenModalInstalacion")).toHaveCount(0);
    await expect(page.locator("#viewAdmin #btnOpenModalTipo")).toHaveCount(0);
  });

  test("CA-2: modulo parque navegable por nav, hash directo y F5", async ({ page }) => {
    // Click en nav parque
    await page.getByTestId("nav-parque").click();
    await expect(page.getByTestId("view-parque")).toBeVisible();
    expect(page.url()).toContain("#/parque");
    await expect(page.getByTestId("nav-parque")).toHaveClass(/active/);
    await expect(page.getByTestId("view-admin")).toBeHidden();

    // Hash directo + reload mantiene vista
    await page.goto("/#/parque");
    await expect(page.getByTestId("view-parque")).toBeVisible();
    await page.reload();
    await page.waitForSelector("#mainNavbar", { state: "visible" });
    await page.waitForFunction(() => document.body.dataset.appReady === "true");
    await expect(page.getByTestId("view-parque")).toBeVisible();
    await expect(page.getByTestId("nav-parque")).toHaveClass(/active/);
  });

  test("CA-3: gestion operativa vive en parque (tablas, modales, filtro)", async ({ page }) => {
    await page.goto("/#/parque");
    await expect(page.getByTestId("view-parque")).toBeVisible();
    await expect(page.getByTestId("seccion-gestion-parque")).toBeVisible();
    await expect(page.getByTestId("tabla-gestion-instalaciones")).toBeVisible();
    // Cambiar a tab medidores
    await page.getByTestId("btn-parque-tab-medidores").click();
    await expect(page.getByTestId("tabla-gestion-medidores")).toBeVisible();

    // Modal instalacion con data-state
    await page.getByTestId("btn-nueva-instalacion").click();
    const modalInst = page.getByTestId("modal-instalacion");
    await expect(modalInst).toHaveAttribute("data-state", "open");
    await page.getByTestId("btn-close-modal-instalacion").click();
    await expect(modalInst).toHaveAttribute("data-state", "closed");

    // Modal medidor con data-state
    await page.getByTestId("btn-nuevo-medidor").click();
    const modalMed = page.getByTestId("modal-medidor");
    await expect(modalMed).toHaveAttribute("data-state", "open");
    await page.getByTestId("btn-close-modal-medidor").click();
    await expect(modalMed).toHaveAttribute("data-state", "closed");

    // Filtro de estado recarga sin romper (volver a tab instalaciones para asertar visible)
    await page.getByTestId("btn-parque-tab-instalaciones").click();
    await page.getByTestId("filtro-parque-estado").selectOption("todas");
    await expect(page.getByTestId("tbody-gestion-instalaciones")).toBeVisible();
    await page.getByTestId("btn-parque-tab-medidores").click();
    await expect(page.getByTestId("tbody-gestion-medidores")).toBeVisible();
  });

  test("CA-4: alta end-to-end desde parque (sede + medidor)", async ({ page }) => {
    const ts = Date.now();
    const nombreSede = `Sede Parque E2E ${ts}`;
    await page.goto("/#/parque");
    await expect(page.getByTestId("view-parque")).toBeVisible();

    // Crear sede
    await page.getByTestId("btn-nueva-instalacion").click();
    await page.locator("#inputInstalacionNombre").fill(nombreSede);
    await page.locator("#inputInstalacionDireccion").fill("Av. Parque Central 1234");
    await page.locator("#formInstalacion button[type='submit']").click();
    await expect(page.locator(".toast-success", { hasText: nombreSede })).toBeVisible();
    await expect(page.getByTestId("modal-instalacion")).toHaveAttribute("data-state", "closed");
    // Fila visible en tabla de parque (acotado a vista activa)
    await expect(page.locator("#viewParque #tbodyGestionInstalaciones", { hasText: nombreSede })).toBeVisible();

    // Crear medidor
    const codigo = `MED-PARQ-${ts.toString().slice(-6)}`;
    await page.getByTestId("btn-nuevo-medidor").click();
    const selInst = page.locator("#selectMedidorInstalacion");
    const nInst = await selInst.locator("option").count();
    if (nInst > 1) await selInst.selectOption({ index: 1 });
    const selTipo = page.locator("#selectMedidorTipo");
    const nTipo = await selTipo.locator("option").count();
    if (nTipo > 1) await selTipo.selectOption({ index: 1 });
    await page.locator("#inputMedidorCodigo").fill(codigo);
    await page.locator("#inputMedidorUbicacion").fill("Sala Parque A");
    await page.locator("#formMedidor button[type='submit']").click();
    await expect(page.locator(".toast-success", { hasText: codigo })).toBeVisible();
    await page.getByTestId("btn-parque-tab-medidores").click();
    await expect(page.locator("#viewParque #tbodyGestionMedidores", { hasText: codigo })).toBeVisible();
  });

  test("CA-5: RBAC del modulo parque (operador bloqueado, supervisor sin sedes)", async ({ page }) => {
    // Operador: nav oculto y redireccion a terreno
    const quickOp = page.getByTestId("quick-role-operador");
    if (await quickOp.isVisible()) {
      await quickOp.click();
      await page.waitForTimeout(300);
    }
    await expect(page.getByTestId("nav-parque")).toBeHidden();
    await page.goto("/#/parque");
    await page.waitForTimeout(400);
    await expect(page.getByTestId("view-operador")).toBeVisible();

    // Supervisor: parque visible pero sin botones de sede/tipo
    const quickSup = page.getByTestId("quick-role-supervisor");
    // Supervisor puede estar oculto para operador; re-logear via login form si hace falta
    if (await quickSup.isVisible().catch(() => false)) {
      await quickSup.click();
      await page.waitForTimeout(800);
    } else {
      await page.goto("/#/login");
      await page.getByTestId("input-login-email").fill("supervisor@medidores.cl");
      await page.getByTestId("input-login-password").fill("demo1234");
      await page.getByTestId("btn-login-submit").click();
      await page.waitForTimeout(800);
    }
    await expect(page.getByTestId("nav-parque")).toBeVisible();
    await page.goto("/#/parque");
    await expect(page.getByTestId("view-parque")).toBeVisible();
    await expect(page.getByTestId("btn-nuevo-medidor")).toBeVisible();
    await expect(page.getByTestId("btn-nueva-instalacion")).toBeHidden();
    await expect(page.getByTestId("btn-nuevo-tipo")).toBeHidden();
  });

  test("CA-6: dashboard informativo carga datos reales tras separacion", async ({ page }) => {
    await page.goto("/#/dashboard");
    await expect(page.getByTestId("view-admin")).toBeVisible();
    // KPIs con valores numericos (no '--')
    const kpiInst = (await page.locator("#kpiTotalInstalaciones").innerText()).trim();
    expect(kpiInst).not.toBe("--");
    expect(kpiInst).not.toBe("");
    await expect(page.locator("#listaActividadReciente")).not.toContainText("Cargando mediciones recientes...");
  });
});
