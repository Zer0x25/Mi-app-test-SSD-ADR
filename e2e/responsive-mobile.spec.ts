import { test, expect } from "@playwright/test";

test.describe("Módulo Responsive & Adaptabilidad Móvil (Hito 13 / feat-016)", () => {
  test.beforeEach(async ({ page, request }) => {
    // Inicializar estado con datos demo
    const seedRes = await request.post("/api/demo/seed");
    expect(seedRes.ok()).toBeTruthy();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("Viewport 320px (XS / iPhone SE 1st Gen): Cero desbordamiento horizontal y navegación por Drawer móvil", async ({ page }) => {
    // 1. Configurar viewport ultra-compacto de 320px
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForTimeout(300);

    // 2. Invariante 1: Cero scroll horizontal a nivel de documento
    const hasHorizontalOverflow = await page.evaluate((): boolean => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // 3. El botón de menú móvil hamburguesa debe ser visible y el switcher de escritorio oculto
    const btnMenu = page.locator("#btnMobileMenuToggle");
    await expect(btnMenu).toBeVisible();

    const desktopSwitcher = page.locator("#roleSwitcher");
    await expect(desktopSwitcher).toBeHidden();

    // 4. Abrir drawer móvil al tocar el botón hamburguesa
    await btnMenu.click();
    const drawer = page.locator("#mobileMenuDrawer");
    await expect(drawer).toBeVisible();

    // 5. Navegar a Modo Terreno desde el drawer móvil
    const btnTerreno = page.locator("#mobileMenuDrawer button:has-text('Modo Terreno')");
    await expect(btnTerreno).toBeVisible();
    await btnTerreno.click();

    // 6. Verificar que la vista de Operador/Terreno se activó y el drawer se cerró
    const viewOperador = page.locator("#viewOperador");
    await expect(viewOperador).toBeVisible();
    await expect(drawer).toBeHidden();

    // 7. En Modo Terreno con 320px, verificar que no hay overflow horizontal y las tarjetas caben completamente
    const overflowInOperador = await page.evaluate((): boolean => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(overflowInOperador).toBe(false);

    const cardsFitInside = await page.evaluate((): boolean => {
      const cards = Array.from(document.querySelectorAll("#gridMedidoresOperador .meter-card"));
      if (cards.length === 0) return true;
      return cards.every((card) => {
        const rect = card.getBoundingClientRect();
        return rect.right <= window.innerWidth + 2 && rect.left >= 0;
      });
    });
    expect(cardsFitInside).toBe(true);
  });

  test("Viewport 320px: Los modales se adaptan a la pantalla dinámica y permiten interactuar con botones de acción", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.waitForTimeout(300);

    // Abrir modal de nuevo medidor desde el dashboard
    const btnNuevoMedidor = page.locator("#btnOpenModalMedidor");
    await expect(btnNuevoMedidor).toBeVisible();
    await btnNuevoMedidor.click();

    // Verificar visibilidad del modal sin desborde horizontal
    const modalBox = page.locator("#modalMedidor .modal-box");
    await expect(modalBox).toBeVisible();

    const modalFitsViewport = await page.evaluate((): boolean => {
      const modal = document.querySelector("#modalMedidor .modal-box");
      if (!modal) return false;
      const rect = modal.getBoundingClientRect();
      return rect.right <= window.innerWidth && rect.left >= 0;
    });
    expect(modalFitsViewport).toBe(true);

    // Los botones de acción en el pie del modal deben ser accesibles
    const btnCancelar = page.locator("#modalMedidor button:has-text('Cancelar')");
    await expect(btnCancelar).toBeVisible();
    await btnCancelar.click();
    await expect(modalBox).toBeHidden();
  });

  test("Viewport 375px (SM / iPhone Estándar): Touch targets accesibles y ergonomía", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    // Verificar cero desbordamiento horizontal
    const hasHorizontalOverflow = await page.evaluate((): boolean => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Verificar área de toque táctil en botón hamburguesa (min-height >= 40px)
    const btnMenu = page.locator("#btnMobileMenuToggle");
    await expect(btnMenu).toBeVisible();
    const box = await btnMenu.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(40);
    }
  });

  test("Viewport 425px (MD / Smartphone Grande): Distribución de KPIs y tablas táctiles", async ({ page }) => {
    await page.setViewportSize({ width: 425, height: 800 });
    await page.waitForTimeout(300);

    // Cero desborde en dashboard principal
    const hasHorizontalOverflow = await page.evaluate((): boolean => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);

    // Tarjetas KPI visibles
    const kpiInstalaciones = page.locator("#kpiCardInstalaciones");
    await expect(kpiInstalaciones).toBeVisible();
  });

  test("Desktop 1280px (Anti-Regresión): Menú hamburguesa oculto y barra horizontal visible", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(300);

    // El botón móvil debe estar oculto en desktop
    const btnMenu = page.locator("#btnMobileMenuToggle");
    await expect(btnMenu).toBeHidden();

    // La barra de módulos estándar debe estar visible
    const desktopSwitcher = page.locator("#roleSwitcher");
    await expect(desktopSwitcher).toBeVisible();

    // Cero desborde en desktop
    const hasHorizontalOverflow = await page.evaluate((): boolean => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test("Viewport 320px y 375px: Filtros selectores en listas (Alertas, Mantenimiento, Auditoría, Reportes, Terreno) contenidos sin desbordamiento", async ({ page }) => {
    const roles = ["alertas", "mantenimiento", "auditoria", "reportes", "operador"];

    for (const width of [320, 375]) {
      await page.setViewportSize({ width, height: 700 });
      await page.waitForTimeout(200);

      for (const role of roles) {
        await page.evaluate((r) => {
          interface AppWindow extends Window {
            switchRole?: (r: string) => void;
          }
          const appWin = window as unknown as AppWindow;
          if (appWin.switchRole) appWin.switchRole(r);
        }, role);
        await page.waitForTimeout(150);

        // Verificar que ningún select ni card-header desborde el ancho de la tarjeta o del viewport
        const overflowFound = await page.evaluate((): boolean => {
          const activeView = document.querySelector(".view-panel.active");
          if (!activeView) return false;

          const selects = Array.from(activeView.querySelectorAll("select"));
          for (const s of selects) {
            const r = s.getBoundingClientRect();
            const card = s.closest(".card") || activeView;
            const cRect = card.getBoundingClientRect();
            if (r.right > cRect.right + 2 || r.right > window.innerWidth + 2) {
              return true;
            }
          }

          const cardHeaders = Array.from(activeView.querySelectorAll(".card-header"));
          for (const ch of cardHeaders) {
            if (ch.scrollWidth > ch.clientWidth + 2) {
              return true;
            }
          }

          return false;
        });

        expect(overflowFound).toBe(false);
      }
    }
  });
});

