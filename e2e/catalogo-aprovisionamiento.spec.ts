import { test, expect } from "@playwright/test";

test.describe("E2E: Aprovisionamiento y Catálogo (Instalaciones, Tipos y Medidores)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Esperar a que la aplicación esté cargada e inicializada
    await page.waitForSelector("#mainNavbar", { state: "visible" });
    // Asegurar sesión ADMIN activa
    const quickAdmin = page.locator("#quickRoleAdmin");
    if (await quickAdmin.isVisible()) {
      await quickAdmin.click();
      await page.waitForTimeout(200);
    }
  });

  test("debe permitir aprovisionar una nueva sede/instalación y reflejarla en los selectores", async ({ page }) => {
    const timestamp = Date.now();
    const nombreSede = `Planta Norte E2E ${timestamp}`;
    const direccionSede = "Av. Panamericana Norte 8500";

    // Abrir modal de nueva instalación
    await page.locator("#btnOpenModalInstalacion").click();
    const modal = page.locator("#modalInstalacion");
    await expect(modal).toHaveClass(/open/);

    // Llenar formulario
    await page.locator("#inputInstalacionNombre").fill(nombreSede);
    await page.locator("#inputInstalacionDireccion").fill(direccionSede);

    // Enviar formulario
    await page.locator("#formInstalacion button[type='submit']").click();

    // Validar toast de éxito y cierre del modal
    await expect(page.locator(".toast-success", { hasText: nombreSede })).toBeVisible();
    await expect(modal).not.toHaveClass(/open/);

    // Verificar que la nueva instalación aparezca en el select de sedes en Reportes
    await page.locator("#tabReportesBtn").click();
    const selectReportes = page.locator("#filtroReporteSede");
    await expect(selectReportes).toContainText(nombreSede);
  });

  test("debe permitir configurar un nuevo tipo de medidor y listarlo para aprovisionamiento", async ({ page }) => {
    const timestamp = Date.now();
    const nombreTipo = `Agua Salina E2E ${timestamp}`;

    // Abrir modal de nuevo tipo
    await page.locator("#btnOpenModalTipo").click();
    const modal = page.locator("#modalTipo");
    await expect(modal).toHaveClass(/open/);

    // Llenar campos
    await page.locator("#inputTipoNombre").fill(nombreTipo);
    await page.locator("#selectTipoRecurso").selectOption("AGUA");
    await page.locator("#inputTipoUnidad").fill("m3");
    await page.locator("#selectTipoMedicion").selectOption("ACUMULATIVO");

    // Enviar
    await page.locator("#formTipo button[type='submit']").click();

    // Validar toast y cierre
    await expect(page.locator(".toast-success", { hasText: nombreTipo })).toBeVisible();
    await expect(modal).not.toHaveClass(/open/);

    // Abrir modal de nuevo medidor para verificar que el tipo esté disponible en las opciones
    await page.locator("#btnOpenModalMedidor").click();
    const selectTipoMedidor = page.locator("#selectMedidorTipo");
    await expect(selectTipoMedidor).toContainText(nombreTipo);

    // Cerrar modal
    await page.locator("#modalMedidor .btn-close").click();
  });

  test("debe dar de alta un nuevo medidor físico y rechazar códigos duplicados con HTTP 409", async ({ page }) => {
    const timestamp = Date.now();
    const codigoUnico = `MED-TEST-${timestamp.toString().slice(-6)}`;

    // 1. Abrir modal y registrar medidor por primera vez
    await page.locator("#btnOpenModalMedidor").click();
    const modal = page.locator("#modalMedidor");
    await expect(modal).toHaveClass(/open/);

    // Seleccionar primera instalación y primer tipo disponibles
    const selectInst = page.locator("#selectMedidorInstalacion");
    const optionsInst = await selectInst.locator("option").all();
    if (optionsInst.length > 1) {
      await selectInst.selectOption({ index: 1 });
    }

    const selectTipo = page.locator("#selectMedidorTipo");
    const optionsTipo = await selectTipo.locator("option").all();
    if (optionsTipo.length > 1) {
      await selectTipo.selectOption({ index: 1 });
    }

    await page.locator("#inputMedidorCodigo").fill(codigoUnico);
    await page.locator("#inputMedidorSerie").fill(`SN-${timestamp}`);
    await page.locator("#inputMedidorUbicacion").fill("Subestación Eléctrica Sala A");

    // Enviar
    await page.locator("#formMedidor button[type='submit']").click();

    // Validar alta exitosa
    await expect(page.locator(".toast-success", { hasText: codigoUnico })).toBeVisible();
    await expect(modal).not.toHaveClass(/open/);

    // 2. Intentar registrar un segundo medidor con el MISMO código para comprobar detección de conflicto (409)
    await page.locator("#btnOpenModalMedidor").click();
    await expect(modal).toHaveClass(/open/);

    if (optionsInst.length > 1) {
      await selectInst.selectOption({ index: 1 });
    }
    if (optionsTipo.length > 1) {
      await selectTipo.selectOption({ index: 1 });
    }

    await page.locator("#inputMedidorCodigo").fill(codigoUnico);
    await page.locator("#inputMedidorUbicacion").fill("Otra Ubicación");

    await page.locator("#formMedidor button[type='submit']").click();

    // Verificar que se muestre toast de error por código duplicado
    await expect(page.locator(".toast-error", { hasText: codigoUnico })).toBeVisible();

    // Cancelar y cerrar modal limpiamente
    await page.locator("#modalMedidor button[type='button']:has-text('Cancelar')").click();
    await expect(modal).not.toHaveClass(/open/);
  });
});
