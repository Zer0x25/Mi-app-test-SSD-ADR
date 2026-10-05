import { test, expect } from "@playwright/test";

test.describe("E2E: Seguridad, Autoservicio de Perfil y Edición de Usuarios", () => {
  test.beforeEach(async ({ page, request }) => {
    // Inicializar seed para garantizar estado predecible
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();

    await page.goto("/");
    await page.waitForSelector("#mainNavbar", { state: "visible" });

    // Asegurar sesión ADMIN activa
    const quickAdmin = page.locator("#quickRoleAdmin");
    if (await quickAdmin.isVisible()) {
      await quickAdmin.click();
      await page.waitForTimeout(200);
    }
  });

  test("debe rechazar contraseña actual incorrecta y permitir cambio exitoso con contraseña válida", async ({ page }) => {
    // 1. Abrir modal de cambio de contraseña desde el pill de usuario
    const btnClave = page.locator("#btnOpenModalCambiarPassword");
    await expect(btnClave).toBeVisible();
    await btnClave.click();

    const modal = page.locator("#modalCambiarPassword");
    await expect(modal).toHaveClass(/open/);

    // 2. Intentar cambio con contraseña actual inválida
    await page.locator("#inputPasswordActual").fill("ClaveErronea999!");
    await page.locator("#inputPasswordNueva").fill("NuevaPasswordSegura2026!");
    await page.locator("#formCambiarPassword button[type='submit']").click();

    // Debe mostrar toast de error y mantener modal abierto
    await expect(page.locator(".toast-error")).toBeVisible();
    await expect(modal).toHaveClass(/open/);

    // 3. Corregir con la contraseña actual válida del administrador ("demo1234")
    await page.locator("#inputPasswordActual").fill("demo1234");
    await page.locator("#inputPasswordNueva").fill("AdminPassword2026!");
    await page.locator("#formCambiarPassword button[type='submit']").click();

    // Debe mostrar toast de éxito y cerrar el modal
    await expect(page.locator(".toast-success", { hasText: "actualizada" })).toBeVisible();
    await expect(modal).not.toHaveClass(/open/);

    // 4. Restaurar inmediatamente la clave por defecto demo1234 para preservar aislamiento entre suites
    await btnClave.click();
    await expect(modal).toHaveClass(/open/);
    await page.locator("#inputPasswordActual").fill("AdminPassword2026!");
    await page.locator("#inputPasswordNueva").fill("demo1234");
    await page.locator("#formCambiarPassword button[type='submit']").click();
    await expect(page.locator(".toast-success", { hasText: "actualizada" })).toBeVisible();
    await expect(modal).not.toHaveClass(/open/);
  });

  test("debe permitir a ADMIN editar los datos de un usuario y actualizar sus asignaciones de sede", async ({ page, request }) => {
    // 1. Crear un usuario dedicado para la prueba de edición para no mutar los usuarios del seed
    const timestampUnico = Date.now().toString().slice(-6);
    const emailUnico = `tecnico-edicion-${timestampUnico}@medidores.cl`;
    const resNuevo = await request.post("/api/auth/register", {
      data: {
        email: emailUnico,
        password: "Password1234!",
        nombre: `Técnico ${timestampUnico}`,
        rol: "OPERADOR",
      },
    });
    expect(resNuevo.ok()).toBeTruthy();

    // 2. Navegar a la pestaña de Usuarios y refrescar
    await page.locator("#tabUsuariosBtn").click();
    await expect(page.locator("#viewUsuarios")).toBeVisible();
    await page.locator("#btnRefrescarUsuarios").click();

    // 3. Localizar la fila del usuario recién creado por su email único
    const filaUsuario = page.locator("#tbodyUsuarios tr", { hasText: emailUnico });
    await expect(filaUsuario).toBeVisible();
    const btnEditar = filaUsuario.locator("button:has-text('Editar')");
    await btnEditar.click();

    const modal = page.locator("#modalEditarUsuario");
    await expect(modal).toHaveClass(/open/);

    // 4. Modificar el nombre
    const timestamp = Date.now().toString().slice(-4);
    const nuevoNombre = `Usuario Modificado ${timestamp}`;
    await page.locator("#editUsuarioNombre").fill(nuevoNombre);

    // 5. Seleccionar el checkbox de instalación y verificar que sea visible
    const checkboxInstalacion = page.locator("#editInstalacionesContainer input[type='checkbox']").first();
    await expect(checkboxInstalacion).toBeVisible();
    await checkboxInstalacion.setChecked(true);

    // 6. Guardar cambios
    await page.locator("#formEditarUsuario button[type='submit']").click();

    // Validar toast de éxito y cierre del modal
    await expect(page.locator(".toast-success", { hasText: "actualizados exitosamente" })).toBeVisible();
    await expect(modal).not.toHaveClass(/open/);

    // 7. Verificar que la tabla refleje el nombre modificado
    await expect(page.locator("#tbodyUsuarios")).toContainText(nuevoNombre);

    // 8. Verificación de Persistencia Roundtrip (Read-After-Write):
    // La fila del usuario debe reflejar la sede asignada (badge con icono 🏢) en lugar de "Sin sedes asignadas"
    await expect(filaUsuario).toContainText("🏢");

    // 9. Reabrir modal y verificar que la casilla de instalación se mantenga seleccionada
    await btnEditar.click();
    await expect(modal).toHaveClass(/open/);
    await expect(page.locator("#editInstalacionesContainer input[type='checkbox']").first()).toBeChecked();
    await page.locator("#modalEditarUsuario .btn-close").click();
    await expect(modal).not.toHaveClass(/open/);
  });
});
