import { test, expect } from "@playwright/test";

test.describe("Flujo E2E: Administración de Usuarios y Credenciales", () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("debe listar el directorio de usuarios con roles y asignaciones", async ({ page }) => {
    await page.goto("/");

    // 1. Navegar a pestaña Usuarios
    await page.click("#tabUsuariosBtn");
    await expect(page.locator("#viewUsuarios")).toBeVisible();
    await expect(page.locator("#headingUsuarios")).toContainText("Gestión Integral de Usuarios");

    // 2. Verificar que el directorio lista los usuarios preexistentes
    const tbody = page.locator("#tbodyUsuarios");
    await expect(tbody).toBeVisible();
    await expect(tbody).toContainText("admin@medidores.cl");
    await expect(tbody).toContainText("Carlos Supervisor");
    await expect(tbody).toContainText("Juan Operador Terreno");
  });

  test("debe permitir crear un nuevo usuario con rol OPERADOR", async ({ page }) => {
    await page.goto("/");

    await page.click("#tabUsuariosBtn");
    await expect(page.locator("#viewUsuarios")).toBeVisible();

    // 1. Abrir modal de nuevo usuario
    await page.click("#btnOpenModalNuevoUsuario");
    const modal = page.locator("#modalNuevoUsuario");
    await expect(modal).toBeVisible();

    // 2. Completar datos con email único por timestamp (Invariante Regla 15)
    const uniqueEmail = `inspector-${Date.now()}@medidores.cl`;
    await page.fill("#inputNuevoUsuarioNombre", "Técnico Inspector E2E");
    await page.fill("#inputNuevoUsuarioEmail", uniqueEmail);
    await page.fill("#inputNuevoUsuarioPassword", "TemporalSegura123!");
    await page.selectOption("#selectNuevoUsuarioRol", "OPERADOR");

    // 3. Enviar formulario
    await page.click("#formNuevoUsuario button[type='submit']");

    // 4. Validar modal cerrado y toast de éxito
    await expect(modal).toBeHidden();
    const successToast = page.locator(".toast-success");
    await expect(successToast.first()).toBeVisible();

    // 5. Verificar que el nuevo usuario aparece en la tabla
    const tbody = page.locator("#tbodyUsuarios");
    await expect(tbody).toContainText(uniqueEmail);
    await expect(tbody).toContainText("Técnico Inspector E2E");
  });

  test("debe permitir a ADMIN restablecer la contraseña de un operador", async ({ page }) => {
    await page.goto("/");

    await page.click("#tabUsuariosBtn");
    await expect(page.locator("#viewUsuarios")).toBeVisible();

    // 1. Hacer clic en el botón Reset Clave del primer operador listado
    const btnReset = page.locator("#tbodyUsuarios button:has-text('Reset Clave')").first();
    await expect(btnReset).toBeVisible();
    await btnReset.click();

    // 2. Validar apertura de modal de reset
    const modalReset = page.locator("#modalResetPassword");
    await expect(modalReset).toBeVisible();

    // 3. Ingresar nueva contraseña temporal
    await page.fill("#resetPasswordNueva", "NuevaClaveReseteada123!");

    // 4. Enviar formulario
    await page.click("#formResetPassword button[type='submit']");

    // 5. Validar cierre de modal y notificación de éxito
    await expect(modalReset).toBeHidden();
    const successToast = page.locator(".toast-success");
    await expect(successToast.first()).toBeVisible();
  });
});
