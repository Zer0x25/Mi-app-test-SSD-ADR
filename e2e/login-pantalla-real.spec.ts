import { test, expect } from "@playwright/test";

test.describe("Flujo E2E: Pantalla de Login Formal y Sesión Multi-Entorno (feat-018)", () => {
  test.beforeEach(async ({ request }) => {
    // Restaurar estado base con la semilla de datos
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("debe permitir cerrar sesión desde el dashboard y desplegar la pantalla de Login formal", async ({ page }) => {
    await page.goto("/");

    // 1. En dev arranca con sesión activa
    const userPill = page.locator("#navUserPill");
    await expect(userPill).toBeVisible();

    // 2. Hacer clic en botón de Salir / Logout
    const btnLogout = page.locator("#btnLogout");
    await expect(btnLogout).toBeVisible();
    await btnLogout.click();

    // 3. Validar despliegue de pantalla de login formal
    const viewLogin = page.locator("#viewLogin");
    await expect(viewLogin).toBeVisible();
    await expect(page.locator("#headingLogin")).toHaveText("Iniciar Sesión");

    // 4. Validar campos con sus respectivos autocompletes y etiquetas
    const emailInput = page.locator("#loginEmail");
    const passwordInput = page.locator("#loginPassword");
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("autocomplete", "username");
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toHaveAttribute("autocomplete", "current-password");

    // 5. Validar que la navegación y controles principales queden ocultos
    await expect(page.locator(".main-nav")).toBeHidden();
    await expect(page.locator("#btnLogout")).toBeHidden();
  });

  test("debe alternar la visibilidad de la contraseña al pulsar el botón del ojo", async ({ page }) => {
    await page.goto("/");
    await page.click("#btnLogout");

    const passwordInput = page.locator("#loginPassword");
    const btnToggle = page.locator("#btnTogglePassword");

    await expect(passwordInput).toHaveAttribute("type", "password");

    // Alternar a texto legible
    await btnToggle.click();
    await expect(passwordInput).toHaveAttribute("type", "text");

    // Alternar nuevamente a protegido
    await btnToggle.click();
    await expect(passwordInput).toHaveAttribute("type", "password");
  });

  test("debe rechazar credenciales incorrectas (401) mostrando alerta visual de error", async ({ page }) => {
    await page.goto("/");
    await page.click("#btnLogout");

    await page.fill("#loginEmail", "admin@medidores.cl");
    await page.fill("#loginPassword", "clave-totalmente-erronea");
    await page.click("#btnLoginSubmit");

    // Alerta visible con mensaje descriptivo
    const alert = page.locator("#loginErrorAlert");
    await expect(alert).toContainText("contraseña incorrectos");

    // La pantalla de login debe permanecer activa
    await expect(page.locator("#viewLogin")).toBeVisible();
  });

  test("debe iniciar sesión exitosamente con credenciales válidas y cargar el dashboard", async ({ page }) => {
    await page.goto("/");
    await page.click("#btnLogout");

    await page.fill("#loginEmail", "admin@medidores.cl");
    await page.fill("#loginPassword", "demo1234");
    await page.click("#btnLoginSubmit");

    // Transición fuera de login
    await expect(page.locator("#viewLogin")).toBeHidden();
    await expect(page.locator("#viewAdmin")).toBeVisible();

    // Píldora de usuario activa
    const userPill = page.locator("#navUserPill");
    await expect(userPill).toContainText("ADMIN");
    await expect(userPill).toContainText("Administrador Central");
    await expect(page.locator("#btnLogout")).toBeVisible();
  });

  test("debe iniciar sesión como OPERADOR y redirigir directamente a Modo Terreno", async ({ page }) => {
    await page.goto("/");
    await page.click("#btnLogout");

    await page.fill("#loginEmail", "operador@medidores.cl");
    await page.fill("#loginPassword", "demo1234");
    await page.click("#btnLoginSubmit");

    // Transición directa a vista operador
    await expect(page.locator("#viewLogin")).toBeHidden();
    await expect(page.locator("#viewOperador")).toBeVisible();
    await expect(page.locator("#headingOperador")).toHaveText("Ingreso de Lecturas en Terreno");

    // Verificar restricciones de operador
    await expect(page.locator("#tabAdminBtn")).toBeHidden();
    await expect(page.locator("#tabUsuariosBtn")).toBeHidden();
  });

  test("en entorno simulado Staging/Prod (devRoleSwitcher: false), oculta el conmutador de roles y bloquea auto-login", async ({ page }) => {
    // Interceptar /api/config simulando entorno staging
    await page.route("**/api/config", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          env: "staging",
          features: {
            devRoleSwitcher: false,
          },
        }),
      });
    });

    // Limpiar tokens y storage previo para simular visita inicial no autenticada
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.goto("/");

    // En staging sin token, debe mostrar Login forzoso sin auto-login
    await expect(page.locator("#viewLogin")).toBeVisible();
    await expect(page.locator(".main-nav")).toBeHidden();

    // La barra de simulación debe estar oculta
    await expect(page.locator("#roleSimulatorBar")).toBeHidden();
    await expect(page.locator("#loginDevQuickAccess")).toBeHidden();
  });
});
