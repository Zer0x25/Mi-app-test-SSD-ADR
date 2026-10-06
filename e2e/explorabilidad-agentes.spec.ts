import { test, expect } from "@playwright/test";

test.describe("E2E: Explorabilidad de Rutas, Localización DOM y Observabilidad para Agentes (feat-020)", () => {
  test.beforeEach(async ({ request }) => {
    // Restaurar estado base con la semilla de datos limpia
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("CA-1: debe permitir navegar a pantallas principales por hash directo y mantener la vista tras recarga (F5)", async ({ page }) => {
    // 1. Acceder directamente a la ruta de Reportes
    await page.goto("/#/reportes");
    await page.waitForSelector("#mainNavbar", { state: "visible" });

    // Verificar que la vista activa sea Reportes y el botón correspondiente esté activo
    const viewReportes = page.getByTestId("view-reportes");
    await expect(viewReportes).toBeVisible();
    await expect(page.getByTestId("nav-reportes")).toHaveClass(/active/);
    await expect(page.getByTestId("view-admin")).toBeHidden();

    // 2. Recargar la página y certificar que se mantiene en la misma vista (sin resetearse al Dashboard)
    await page.reload();
    await page.waitForSelector("#mainNavbar", { state: "visible" });
    await expect(page.getByTestId("view-reportes")).toBeVisible();
    await expect(page.getByTestId("nav-reportes")).toHaveClass(/active/);

    // 3. Navegar a Alertas cambiando el hash
    await page.goto("/#/alertas");
    await expect(page.getByTestId("view-alertas")).toBeVisible();
    await expect(page.getByTestId("nav-alertas")).toHaveClass(/active/);
    await expect(page.getByTestId("view-reportes")).toBeHidden();

    // 4. Navegar a Mantenimiento
    await page.goto("/#/mantenimiento");
    await expect(page.getByTestId("view-mantenimiento")).toBeVisible();
    await expect(page.getByTestId("nav-mantenimiento")).toHaveClass(/active/);

    // 5. Navegar a Usuarios
    await page.goto("/#/usuarios");
    await expect(page.getByTestId("view-usuarios")).toBeVisible();
    await expect(page.getByTestId("nav-usuarios")).toHaveClass(/active/);

    // 6. Navegar a Auditoría
    await page.goto("/#/auditoria");
    await expect(page.getByTestId("view-auditoria")).toBeVisible();
    await expect(page.getByTestId("nav-auditoria")).toHaveClass(/active/);

    // 7. Navegar a Webhooks
    await page.goto("/#/webhooks");
    await expect(page.getByTestId("view-webhooks")).toBeVisible();
    await expect(page.getByTestId("nav-webhooks")).toHaveClass(/active/);

    // 8. Navegar a Notificaciones
    await page.goto("/#/notificaciones");
    await expect(page.getByTestId("view-notificaciones")).toBeVisible();
    await expect(page.getByTestId("nav-notificaciones")).toHaveClass(/active/);

    // 9. Navegar a Dashboard
    await page.goto("/#/dashboard");
    await expect(page.getByTestId("view-admin")).toBeVisible();
    await expect(page.getByTestId("nav-dashboard")).toHaveClass(/active/);
  });

  test("CA-1: debe soportar historial del navegador (atrás y adelante) sincronizando la vista activa y los controles", async ({ page }) => {
    await page.goto("/#/dashboard");
    await page.waitForSelector("#mainNavbar", { state: "visible" });

    // Clic en pestaña Reportes
    await page.getByTestId("nav-reportes").click();
    await expect(page.getByTestId("view-reportes")).toBeVisible();
    expect(page.url()).toContain("#/reportes");

    // Clic en pestaña Alertas
    await page.getByTestId("nav-alertas").click();
    await expect(page.getByTestId("view-alertas")).toBeVisible();
    expect(page.url()).toContain("#/alertas");

    // Retroceder en el historial (debe regresar a Reportes)
    await page.goBack();
    await expect(page.getByTestId("view-reportes")).toBeVisible();
    await expect(page.getByTestId("view-alertas")).toBeHidden();
    await expect(page.getByTestId("nav-reportes")).toHaveClass(/active/);
    expect(page.url()).toContain("#/reportes");

    // Retroceder nuevamente (debe regresar a Dashboard)
    await page.goBack();
    await expect(page.getByTestId("view-admin")).toBeVisible();
    await expect(page.getByTestId("nav-dashboard")).toHaveClass(/active/);
    expect(page.url()).toMatch(/#\/(dashboard|admin)?/);

    // Avanzar en el historial (debe volver a Reportes)
    await page.goForward();
    await expect(page.getByTestId("view-reportes")).toBeVisible();
    await expect(page.getByTestId("nav-reportes")).toHaveClass(/active/);
    expect(page.url()).toContain("#/reportes");
  });

  test("CA-2 y CA-3: controles localizables, modales con data-state y roles accesibles", async ({ page }) => {
    await page.goto("/#/dashboard");
    await page.waitForSelector("#mainNavbar", { state: "visible" });

    // Localizar botón de nueva instalación usando data-testid
    const btnNuevaInstalacion = page.getByTestId("btn-nueva-instalacion");
    await expect(btnNuevaInstalacion).toBeVisible();

    // Abrir modal de instalación y verificar data-state="open"
    await btnNuevaInstalacion.click();
    const modalInstalacion = page.getByTestId("modal-instalacion");
    await expect(modalInstalacion).toBeVisible();
    await expect(modalInstalacion).toHaveAttribute("data-state", "open");
    await expect(modalInstalacion).toHaveAttribute("role", "dialog");
    await expect(modalInstalacion).toHaveAttribute("aria-modal", "true");

    // Localizar formulario y botón de cerrar mediante data-testid
    const formInstalacion = page.getByTestId("form-instalacion");
    await expect(formInstalacion).toBeVisible();
    const btnCerrar = page.getByTestId("btn-close-modal-instalacion");
    await expect(btnCerrar).toBeVisible();

    // Cerrar el modal y verificar data-state="closed"
    await btnCerrar.click();
    await expect(modalInstalacion).toHaveAttribute("data-state", "closed");
    await expect(modalInstalacion).not.toHaveClass(/open/);

    // Probar modal de medidor
    const btnNuevoMedidor = page.getByTestId("btn-nuevo-medidor");
    await btnNuevoMedidor.click();
    const modalMedidor = page.getByTestId("modal-medidor");
    await expect(modalMedidor).toBeVisible();
    await expect(modalMedidor).toHaveAttribute("data-state", "open");
    await page.getByTestId("btn-close-modal-medidor").click();
    await expect(modalMedidor).toHaveAttribute("data-state", "closed");
  });

  test("CA-3: estados vacíos (empty-state) identificables en el DOM ante búsquedas sin coincidencia", async ({ page }) => {
    await page.goto("/#/operador");
    await page.waitForSelector("#mainNavbar", { state: "visible" });
    await page.waitForSelector("#gridMedidoresOperador .meter-card", { state: "visible" });

    // Aplicar filtro de búsqueda con texto sin coincidencia
    const inputFiltro = page.getByTestId("filtro-search-medidores");
    await expect(inputFiltro).toBeVisible();
    await inputFiltro.fill("CODIGO-INEXISTENTE-XYZ-999");
    await page.waitForTimeout(300);

    // El contenedor de tarjetas debe mostrar un empty-state claramente identificable
    const emptyState = page.locator("#gridMedidoresOperador [data-testid='empty-state']");
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText("No se encontraron medidores");

    // Limpiar filtro y verificar que se restablezcan las tarjetas
    await inputFiltro.fill("");
    await page.waitForTimeout(300);
    await expect(emptyState).toBeHidden();
    const meterCards = page.locator("#gridMedidoresOperador .meter-card");
    expect(await meterCards.count()).toBeGreaterThan(0);
  });

  test("CA-4: capa de diagnósticos (window.__DIAGNOSTICS__) y trazabilidad ante errores de API", async ({ page }) => {
    await page.goto("/#/dashboard");
    await page.waitForSelector("#mainNavbar", { state: "visible" });

    // Verificar que window.__DIAGNOSTICS__ esté disponible en el contexto global
    const diagnosticsReady = await page.evaluate(() => {
      interface DiagnosticsWindow extends Window {
        __DIAGNOSTICS__?: {
          activeRoute: string;
          currentUser: unknown;
          apiErrors: unknown[];
          lastApiError: unknown;
        };
      }
      const win = window as unknown as DiagnosticsWindow;
      return typeof win.__DIAGNOSTICS__ === "object" && win.__DIAGNOSTICS__ !== null;
    });
    expect(diagnosticsReady).toBe(true);

    // Provocar una solicitud fallida simulada a un endpoint 404
    await page.evaluate(async () => {
      interface AppWindow extends Window {
        api?: {
          request: (endpoint: string, options?: Record<string, unknown>) => Promise<unknown>;
        };
      }
      const win = window as unknown as AppWindow;
      try {
        await win.api?.request("/api/endpoint-inexistente-para-test", { skipAuthToast: true });
      } catch {
        // Se espera el error
      }
    });

    // Validar que el error fue registrado en window.__DIAGNOSTICS__ con contexto suficiente
    const lastError = await page.evaluate(() => {
      interface DiagnosticsWindow extends Window {
        __DIAGNOSTICS__?: {
          lastApiError: {
            endpoint: string;
            status: number;
            message: string;
            timestamp: string;
          } | null;
        };
      }
      const win = window as unknown as DiagnosticsWindow;
      return win.__DIAGNOSTICS__?.lastApiError;
    });

    expect(lastError).not.toBeNull();
    expect(lastError?.endpoint).toContain("/api/endpoint-inexistente-para-test");
    expect(lastError?.status).toBe(404);
  });
});
