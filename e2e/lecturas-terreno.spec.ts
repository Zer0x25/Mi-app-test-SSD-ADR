import { test, expect } from "@playwright/test";

test.describe("Flujo E2E: Captura y Validación de Lecturas en Terreno (Modo Operador)", () => {
  test.beforeEach(async ({ request }) => {
    // Restaurar base de datos con datos demo limpios
    const res = await request.post("/api/demo/seed");
    expect(res.ok()).toBeTruthy();
  });

  test("debe permitir al operador capturar lecturas válidas y rechazar lecturas decrecientes", async ({ page }) => {
    await page.goto("/");

    // 1. Conmutar a Operador
    await page.click("#quickRoleOperador");
    await expect(page.locator("#viewOperador")).toBeVisible();
    await expect(page.locator("#navUserPill")).toContainText("OPERADOR");

    // 2. Verificar que se cargan instalaciones asignadas en el selector
    const selectInst = page.locator("#selectOperadorInstalacion");
    await expect(selectInst).toBeVisible();
    await expect(selectInst.locator("option")).not.toHaveCount(1);

    // Seleccionar Planta Industrial Norte donde hay medidores con lecturas previas
    const options = await selectInst.locator("option").all();
    for (const opt of options) {
      const text = await opt.innerText();
      if (text.includes("Planta Industrial Norte")) {
        const val = await opt.getAttribute("value");
        if (val) {
          await selectInst.selectOption(val);
          break;
        }
      }
    }

    // 3. Verificar que se renderizan las tarjetas de medidores
    const meterCards = page.locator("#gridMedidoresOperador .meter-card");
    await expect(meterCards.first()).toBeVisible();

    // Obtener la tarjeta del medidor con lectura previa (MED-AG-NORTE-01)
    const meterCard = page.locator(".meter-card", { hasText: "MED-AG-NORTE-01" });
    await expect(meterCard).toBeVisible();

    // 4. Abrir modal de registro de lectura
    await meterCard.locator("button:has-text('Registrar Lectura')").click();
    const modalLectura = page.locator("#modalLectura");
    await expect(modalLectura).toBeVisible();
    await expect(page.locator("#modalLecturaCodigo")).toHaveText("MED-AG-NORTE-01");

    // 5. Probar Invariante Negativa: Lectura Decreciente Prohibida
    // Extraer lectura previa del DOM del modal aislando solo la cifra numérica de la unidad (ej. evitar el '3' de 'M3')
    const txtLecturaPrevia = await page.locator("#modalLecturaAnterior").innerText();
    const matchNum = txtLecturaPrevia.match(/([0-9.,]+)/);
    const cleanNum = matchNum ? matchNum[1].replace(/\./g, "").replace(",", ".") : "1289";
    const valorPrevio = parseFloat(cleanNum) || 1289;
    const valorMenor = Math.max(0, valorPrevio - 100).toFixed(1);

    await page.fill("#modalLecturaInputValor", valorMenor);
    await page.click("#formLectura button[type='submit']");

    // Verificar notificación toast de rechazo y que el modal permanece abierto
    const errorToast = page.locator(".toast-error, .toast-warning");
    await expect(errorToast.first()).toBeVisible();
    await expect(modalLectura).toBeVisible();

    // 6. Probar Invariante Positiva: Lectura Creciente Válida
    // Ingresar un valor estrictamente mayor a la previa
    const nuevoValor = (valorPrevio + 120.5).toFixed(1);
    await page.fill("#modalLecturaInputValor", nuevoValor);
    await page.fill("#modalLecturaObservaciones", "Inspección rutinaria turno E2E Playwright");

    // Enviar formulario
    await page.click("#formLectura button[type='submit']");

    // Verificar notificación de éxito
    const successToast = page.locator(".toast-success");
    await expect(successToast.first()).toBeVisible();

    // Verificar que el modal se cierra
    await expect(modalLectura).toBeHidden();

    // 7. Verificar que la tarjeta del medidor se actualizó con la nueva lectura
    await expect(meterCard.locator(".reading-value")).toBeVisible();
  });
});
