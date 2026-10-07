import { test, expect } from "@playwright/test";

test.describe("E2E: Alineación estándar OBIS/origen/factor (feat-025)", () => {
  test.beforeEach(async ({ request, page }) => {
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
    await page.goto("/#/parque");
    await page.waitForSelector("#mainNavbar", { state: "visible" });
    await page.waitForFunction(() => document.body.dataset.appReady === "true");
    const quickAdmin = page.getByTestId("quick-role-admin");
    if (await quickAdmin.isVisible().catch(() => false)) {
      await quickAdmin.click();
      await page.waitForTimeout(300);
    }
    await page.getByTestId("nav-parque").click();
    await expect(page.getByTestId("view-parque")).toBeVisible();
  });

  test("debe dar de alta un medidor con código externo y factor, y rechazar externo duplicado", async ({ page }) => {
    const ts = Date.now();
    const codigo = `MED-STD-${ts.toString().slice(-6)}`;
    const externo = `OBIS-E2E-${ts.toString().slice(-6)}`;

    await page.getByTestId("btn-nuevo-medidor").click();
    await expect(page.getByTestId("modal-medidor")).toHaveAttribute("data-state", "open");
    const selInst = page.locator("#selectMedidorInstalacion");
    await expect(selInst.locator("option").nth(1)).toBeAttached({ timeout: 10000 });
    await selInst.selectOption({ index: 1 });
    const selTipo = page.locator("#selectMedidorTipo");
    await expect(selTipo.locator("option").nth(1)).toBeAttached({ timeout: 10000 });
    await selTipo.selectOption({ index: 1 });
    await page.locator("#inputMedidorCodigo").fill(codigo);
    await page.locator("#inputMedidorUbicacion").fill("Sala Trafo E2E");
    await page.locator("#inputMedidorCodigoExterno").fill(externo);
    await page.locator("#inputMedidorFactor").fill("20");
    await page.locator("#formMedidor button[type='submit']").click();
    await expect(page.locator(".toast-success", { hasText: codigo })).toBeVisible();
    await page.getByTestId("btn-parque-tab-medidores").click();
    await expect(page.locator("#viewParque #tbodyGestionMedidores", { hasText: codigo })).toBeVisible();

    // Segundo medidor con el MISMO código externo debe fallar con 409
    await page.getByTestId("btn-nuevo-medidor").click();
    await selInst.selectOption({ index: 1 });
    await selTipo.selectOption({ index: 1 });
    await page.locator("#inputMedidorCodigo").fill(`${codigo}-B`);
    await page.locator("#inputMedidorUbicacion").fill("Sala Trafo E2E B");
    await page.locator("#inputMedidorCodigoExterno").fill(externo);
    await page.locator("#formMedidor button[type='submit']").click();
    await expect(page.locator(".toast-error").first()).toBeVisible();
    await page.locator("#modalMedidor button:has-text('Cancelar')").click();
  });

  test("debe aplicar el factor de instalación al registrar lectura (dial × factor = real)", async ({ page }) => {
    const ts = Date.now();
    const codigo = `MED-FAC-${ts.toString().slice(-6)}`;

    // Alta con factor 20 sobre tipo ACUMULATIVO estándar (×1)
    await page.getByTestId("btn-nuevo-medidor").click();
    const selInst = page.locator("#selectMedidorInstalacion");
    await expect(selInst.locator("option").nth(1)).toBeAttached({ timeout: 10000 });
    await selInst.selectOption({ index: 1 });
    const instalacionId = await selInst.inputValue();
    const selTipo = page.locator("#selectMedidorTipo");
    const opts = await selTipo.locator("option").all();
    let tipoElegido = false;
    for (const o of opts) {
      const txt = (await o.innerText()) || "";
      if (txt.includes("Electricidad Trifásica")) {
        const v = await o.getAttribute("value");
        if (v) { await selTipo.selectOption(v); tipoElegido = true; break; }
      }
    }
    if (!tipoElegido) await selTipo.selectOption({ index: 1 });
    await page.locator("#inputMedidorCodigo").fill(codigo);
    await page.locator("#inputMedidorUbicacion").fill("Sala Trafo Factor E2E");
    await page.locator("#inputMedidorFactor").fill("20");
    await page.locator("#formMedidor button[type='submit']").click();
    await expect(page.locator(".toast-success", { hasText: codigo })).toBeVisible();

    // Registrar dial 5 en terreno → real 100
    await page.getByTestId("nav-operador").click();
    await expect(page.getByTestId("view-operador")).toBeVisible();
    await page.locator("#selectOperadorInstalacion").selectOption(instalacionId);
    await page.waitForTimeout(500);
    const card = page.locator("#gridMedidoresOperador .meter-card", { hasText: codigo });
    await expect(card).toBeVisible();
    await card.locator("button:has-text('Registrar Lectura')").click();
    await expect(page.locator("#modalLectura")).toBeVisible();
    await page.locator("#modalLecturaInputValor").fill("5");
    await page.locator("#formLectura button[type='submit']").click();
    await expect(page.locator(".toast-success").first()).toBeVisible();

    // La tarjeta debe mostrar el valor REAL (100), no el dial
    await expect(card.locator(".reading-value")).toContainText("100");
  });
});
