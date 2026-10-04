import { test, expect } from "@playwright/test";

test.describe("Módulo Fichas Adaptativas Móviles en Tablas (Hito 13.1 / feat-017)", () => {
  test.beforeEach(async ({ page, request }) => {
    const seedRes = await request.post("/api/demo/seed");
    expect(seedRes.ok()).toBeTruthy();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("Viewport 375px (Mobile): Las filas de la tabla de usuarios se transforman en fichas apiladas con data-label y botones >= 44px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    // Navegar a Usuarios mediante Drawer móvil
    const btnMenu = page.locator("#btnMobileMenuToggle");
    await expect(btnMenu).toBeVisible();
    await btnMenu.click();

    const btnUsuarios = page.locator("#mobileMenuDrawer button:has-text('Usuarios')");
    await expect(btnUsuarios).toBeVisible();
    await btnUsuarios.click();

    const viewUsuarios = page.locator("#viewUsuarios");
    await expect(viewUsuarios).toBeVisible();

    // 1. thead debe estar oculto visualmente en móvil
    const theadDisplay = await page.evaluate((): string => {
      const thead = document.querySelector("#tablaUsuarios thead");
      return thead ? window.getComputedStyle(thead).display : "";
    });
    expect(theadDisplay).toBe("none");

    // 2. Esperar filas de usuarios
    const filas = page.locator("#tbodyUsuarios tr");
    await expect(filas.first()).toBeVisible();
    const count = await filas.count();
    expect(count).toBeGreaterThan(0);

    // 3. Cada fila se comporta como ficha (display flex / block con dirección columna)
    const filaStyles = await page.evaluate((): { display: string; flexDirection: string } => {
      const tr = document.querySelector("#tbodyUsuarios tr");
      if (!tr) return { display: "", flexDirection: "" };
      const cs = window.getComputedStyle(tr);
      return { display: cs.display, flexDirection: cs.flexDirection };
    });
    expect(["flex", "block"]).toContain(filaStyles.display);
    if (filaStyles.display === "flex") {
      expect(filaStyles.flexDirection).toBe("column");
    }

    // 4. Las celdas deben tener data-label
    const hasDataLabels = await page.evaluate((): boolean => {
      const cells = Array.from(document.querySelectorAll("#tbodyUsuarios tr:first-child td"));
      if (cells.length === 0) return false;
      return cells.every((td) => td.hasAttribute("data-label"));
    });
    expect(hasDataLabels).toBe(true);

    // 5. Los botones de acción en la ficha deben tener min-height >= 44px
    const buttonHeightsOk = await page.evaluate((): boolean => {
      const buttons = Array.from(document.querySelectorAll("#tbodyUsuarios tr:first-child button"));
      if (buttons.length === 0) return false;
      return buttons.every((b) => b.getBoundingClientRect().height >= 42); // 44px nominal / tolerancia subpixel
    });
    expect(buttonHeightsOk).toBe(true);

    // 6. Cero scroll horizontal
    const hasOverflow = await page.evaluate((): boolean => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test("Viewport 375px: Tabla de incidentes y alertas se transforma en fichas móviles", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    // Navegar a Alertas desde menú Drawer móvil
    const btnMenu = page.locator("#btnMobileMenuToggle");
    await expect(btnMenu).toBeVisible();
    await btnMenu.click();

    const btnAlertas = page.locator("#mobileMenuDrawer button:has-text('Alertas')");
    await expect(btnAlertas).toBeVisible();
    await btnAlertas.click();

    const viewAlertas = page.locator("#viewAlertas");
    await expect(viewAlertas).toBeVisible();

    // thead oculto
    const theadDisplay = await page.evaluate((): string => {
      const thead = document.querySelector("#tablaAlertasIncidentes thead");
      return thead ? window.getComputedStyle(thead).display : "";
    });
    expect(theadDisplay).toBe("none");

    // Verificar data-labels en las celdas de incidentes si existen
    const hasDataLabels = await page.evaluate((): boolean => {
      const cells = Array.from(document.querySelectorAll("#tbodyAlertasIncidentes tr:first-child td"));
      if (cells.length === 0 || cells[0].classList.contains("empty-state")) return true;
      return cells.every((td) => td.hasAttribute("data-label"));
    });
    expect(hasDataLabels).toBe(true);

    // Cero desborde
    const hasOverflow = await page.evaluate((): boolean => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasOverflow).toBe(false);
  });

  test("Viewport 375px: Tablas de Mantenimiento, Auditoría y Webhooks se adaptan a fichas móviles con data-labels", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    const tablesToVerify = [
      { tabName: "Mantenimiento", tableId: "tablaMantenimientosBitacora", tbodyId: "tbodyMantenimientosBitacora" },
      { tabName: "Auditoría", tableId: "tablaAuditoria", tbodyId: "tbodyAuditoria" },
      { tabName: "Webhooks", tableId: "tablaWebhooks", tbodyId: "tbodyWebhooks" },
    ];

    for (const item of tablesToVerify) {
      // Abrir menú móvil
      const btnMenu = page.locator("#btnMobileMenuToggle");
      await expect(btnMenu).toBeVisible();
      await btnMenu.click();

      // Clic en tab
      const navBtn = page.locator(`#mobileMenuDrawer button:has-text('${item.tabName}')`);
      await expect(navBtn).toBeVisible();
      await navBtn.click();
      await page.waitForTimeout(250);

      // thead oculto en móvil
      const theadHidden = await page.evaluate((tId): boolean => {
        const thead = document.querySelector(`#${tId} thead`);
        return !thead || window.getComputedStyle(thead).display === "none";
      }, item.tableId);
      expect(theadHidden).toBe(true);

      // Celdas con data-label
      const dataLabelsOk = await page.evaluate((tbId): boolean => {
        const firstRowCells = Array.from(document.querySelectorAll(`#${tbId} tr:first-child td`));
        if (firstRowCells.length === 0 || firstRowCells[0].classList.contains("empty-state")) return true;
        return firstRowCells.every((td) => td.hasAttribute("data-label"));
      }, item.tbodyId);
      expect(dataLabelsOk).toBe(true);

      // Cero scroll horizontal
      const hasOverflow = await page.evaluate((): boolean => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(hasOverflow).toBe(false);
    }
  });

  test("Viewport 1280px (Desktop): La tabla conserva la estructura tabular clásica (thead visible, display table-row)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);

    // En desktop, navegar con switcher de escritorio
    const tabUsuarios = page.locator("#tabUsuariosBtn");
    await expect(tabUsuarios).toBeVisible();
    await tabUsuarios.click();

    const viewUsuarios = page.locator("#viewUsuarios");
    await expect(viewUsuarios).toBeVisible();

    // thead debe ser visible (table-header-group)
    const theadDisplay = await page.evaluate((): string => {
      const thead = document.querySelector("#tablaUsuarios thead");
      return thead ? window.getComputedStyle(thead).display : "";
    });
    expect(theadDisplay).toBe("table-header-group");

    // tr debe ser table-row
    const trDisplay = await page.evaluate((): string => {
      const tr = document.querySelector("#tbodyUsuarios tr");
      return tr ? window.getComputedStyle(tr).display : "";
    });
    expect(trDisplay).toBe("table-row");
  });
});
