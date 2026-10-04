# Spec: feat-016 - Adaptabilidad Responsiva Mobile-First y Usabilidad en Terreno

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias y de integración que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Ampliar el alcance y accesibilidad del sistema Medidores mediante una arquitectura responsiva progresiva Mobile-First, garantizando un funcionamiento fluido, estandarizado y ergonómico desde pantallas compactas de 320px (iPhone SE 1ª gen), escalando a 375px (iPhone estándar), 425px (smartphones grandes/phablets), tablets y escritorio, sin regresiones funcionales ni desbordamientos horizontales.
- **Archivos editables autorizados:**
  - `public/css/tokens.css`
  - `public/css/components.css`
  - `public/app.css`
  - `public/index.html`
  - `public/js/components.js`
  - `e2e/responsive-mobile.spec.ts`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/*`
  - `src/modules/*`
  - `docs/adr/*` (excepto la formalización inmutable inicial de ADR 0010)
  - `prisma/schema.prisma`

---

## 2. Contrato de Diseño Responsivo y Tokens Semánticos

### A. Escala de Breakpoints Formalizada
```css
/* Escala Progresiva de Pantallas */
/* Extra Small (Mobile Compacto): 320px - 374px */
/* Small (Mobile Estándar): 375px - 424px */
/* Medium (Mobile Grande / Phablet): 425px - 767px */
/* Large (Tablet): 768px - 1023px */
/* Extra Large (Desktop): >= 1024px */
```

### B. Tokens y Dimensiones de Ergonomía Móvil
- **Touch Target Mínimo:** `min-height: 44px` y `min-width: 44px` en botones, pestañas de menú y controles interactivos en viewports móviles (`< 768px`).
- **Espaciado Seguro Lateral:**
  - En `320px – 374px`: Padding contenedor de `0.75rem` (12px) a ambos lados.
  - En `375px – 424px`: Padding contenedor de `1rem` (16px) a ambos lados.
  - En `425px – 767px`: Padding contenedor de `1.25rem` (20px) a ambos lados.
  - En `>= 768px`: Padding original de `1.5rem` (24px) a ambos lados.
- **Prevención de Zoom en iOS:** Todos los elementos `<input>`, `<select>` y `<textarea>` deben contar con `font-size: 1rem` (16px) en dispositivos móviles para impedir el auto-zoom nativo de Safari.
- **Viewport Dinámico para Modales:** Uso de `max-height: 90dvh` (con fallback `90vh`) en `.modal-box`, con cabecera y pie con `position: sticky` para garantizar que los botones de acción nunca queden ocultos tras el scroll ni tras el teclado virtual.

---

## 3. Arquitectura del Menú Móvil (Drawer & Topbar)

### A. Marcador Semántico en Cabecera (`public/index.html`)
1. **Botón Menú Hamburguesa Móvil (`#btnMobileMenuToggle`):**
   - Visible exclusivamente en `@media (max-width: 767px)`.
   - Oculto (`display: none`) en resoluciones de escritorio (`>= 768px`).
   - Atributos de accesibilidad: `aria-expanded="false"`, `aria-controls="mobileMenuDrawer"`, `aria-label="Abrir menú de navegación"`.
2. **Panel Deslizante / Drawer Accesible (`#mobileMenuDrawer`):**
   - Estructura con backdrop difuminado (`.mobile-drawer-backdrop`) y panel deslizable (`.mobile-drawer-content`).
   - Incluye:
     - Botón de cierre (`#btnCloseMobileMenu`).
     - Lista completa y táctil de los 9 módulos (`Dashboard`, `Reportes`, `Alertas`, `Mantenimiento`, `Usuarios`, `Auditoría`, `Webhooks`, `Notificaciones`, `Modo Terreno`).
     - Conmutador rápido de roles RBAC adaptado a botones anchos táctiles.
     - Interruptor de tema Claro/Oscuro y botón de datos demo.
   - Cierre reactivo automático al hacer clic en cualquier opción de módulo o presionar `Escape`.

### B. Elementos Permanentes en la Cabecera Móvil
- Logotipo y título compacto de la aplicación.
- Indicador de estado de red (`#networkStatusBadge` - Online/Offline).
- Botón de cola offline (`#syncQueueBtn`) si existen lecturas pendientes.
- Botón hamburguesa accesible.

---

## 4. Invariantes de Adaptabilidad y Reglas Visuales

### A. Invariantes Positivas (Garantías de Comportamiento)
1. **Zero Horizontal Overflow:** En cualquier resolución entre 320px y 3840px, el ancho total del DOM debe coincidir exactamente con el ancho de la ventana (`document.documentElement.scrollWidth <= window.innerWidth`).
2. **Funcionalidad Plena en Terreno (320px - 425px):**
   - El operador puede seleccionar instalaciones, ver la lista de medidores asignados y abrir el modal para capturar una lectura sin que ningún elemento se recorte.
   - Los modales deben mostrar claramente los campos y los botones de acción ("Guardar", "Cancelar") sin importar el tamaño de pantalla.
3. **Ergonomía Táctil:** Los botones y enlaces interactivos principales en pantallas táctiles deben cumplir con la altura mínima de 44px.
4. **Legibilidad de Mediciones:** Las cifras de lectura en `.reading-value` y los consumos netos deben permanecer legibles en tipografía monoespaciada sin truncamiento.

### B. Invariantes Negativas (Prohibiciones Duras)
1. **Prohibido el Scroll Horizontal en Body:** Queda prohibido el desbordamiento involuntario que obligue al usuario a desplazarse lateralmente para ver el contenido.
2. **Prohibida la Rotura del Modo Escritorio:** Las optimizaciones para 320px - 425px no deben alterar negativamente la visualización de alta densidad en pantallas de 1024px o superiores.
3. **Prohibido el Uso de Dependencias Externas:** No se permite instalar Tailwind, Bootstrap ni frameworks pesados de CSS; se utiliza exclusivamente CSS moderno y Vanilla JS.

---

## 5. Criterios de Aceptación (Definition of Done)

- [x] **Suite de Pruebas E2E de Responsividad Móvil (`e2e/responsive-mobile.spec.ts`):**
  - [x] **Prueba Viewport 320px (iPhone SE 1ª gen / Pantalla Compacta):**
    - [x] `scrollWidth` del documento es igual o menor a `clientWidth` (cero desbordamiento horizontal).
    - [x] El botón hamburguesa móvil (`#btnMobileMenuToggle`) es visible y la barra de pestañas horizontal de escritorio está oculta.
    - [x] Al pulsar el botón hamburguesa, el drawer móvil se abre (`aria-expanded="true"`), permitiendo navegar a cualquier módulo (ej: `Reportes`, `Modo Terreno`).
    - [x] En Modo Terreno, las tarjetas de medidores (`.meter-card`) se adaptan al ancho disponible sin desbordar.
    - [x] El modal de lectura (`#modalLectura` o similar) se abre y sus botones de confirmación y cierre son completamente visibles e interactuables.
  - [x] **Prueba Viewport 375px (iPhone 12/13/14/15 / Pantalla Estándar):**
    - [x] Cero desbordamiento horizontal.
    - [x] El drawer móvil opera con fluidez y los botones tienen altura de toque adecuada (>= 44px).
    - [x] Las métricas de KPI se presentan de forma clara y accesible.
  - [x] **Prueba Viewport 425px (Smartphones Grandes / Phablets):**
    - [x] Cero desbordamiento horizontal.
    - [x] Rejillas de KPIs y paneles de dashboard distribuyen el espacio adecuadamente.
  - [x] **Prueba Anti-Regresión en Desktop (1280px):**
    - [x] La barra de menú hamburguesa se oculta automáticamente.
    - [x] La barra horizontal `.role-switcher` se muestra con los 9 módulos estándar de escritorio.
    - [x] Todas las pruebas existentes de Playwright (19/19) siguen superándose con 100% de éxito.
- [x] **Quality Gate Determinista:**
  - [x] `./scripts/verify.sh` superado con código de salida 0 (206/206 Vitest tests pasando).
  - [x] `npx playwright test` superado con código de salida 0 (24/24 tests pasando).
