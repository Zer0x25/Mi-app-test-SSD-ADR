# ADR 0010: Estrategia de Diseño Responsivo Mobile-First, Adaptabilidad Multi-Pantalla y Ergonomía en Terreno

- **Fecha:** 2026-10-04
- **Estado:** Aceptado
- **Afecta a:** Capa de Presentación (`public/app.css`, `public/css/tokens.css`, `public/css/components.css`, `public/index.html`, `public/js/components.js`), Experiencia de Operadores en Terreno, Pruebas E2E de Playwright

---

## 1. Contexto y Problema

El sistema **Medidores** opera como una plataforma integral de telemetría y supervisión de consumos industriales (Agua, Electricidad, Combustible, Gas). Si bien los administradores y supervisores gestionan reportes, auditorías y facturas desde computadoras de escritorio o portátiles, **los operadores en terreno capturan lecturas, verifican precintos e inspeccionan anomalías directamente al pie de los medidores físicos**, utilizando smartphones y tabletas en condiciones complejas (salas de bombas, tableros eléctricos, patios industriales, iluminación variable y con frecuencia operando con guantes o con una sola mano).

La implementación visual inicial (ADR 0002) priorizó una cuadrícula de escritorio de alta densidad. En dispositivos móviles compactos y estándar, este diseño presenta limitaciones críticas:
1. **Desbordamiento Horizontal del Viewport (Horizontal Overflow):** En pantallas angostas (320px a 425px), elementos con anchos fijos o mínimos rígidos (como `.meters-grid { minmax(320px, 1fr) }`, `.operator-facility-selector .form-group { min-width: 280px }` sumado a paddings laterales de 24px) forzan un scroll horizontal que desalinea la interfaz.
2. **Saturación en Barra de Navegación:** El selector de navegación horizontal alberga 9 módulos distintos más la barra de simulación RBAC y controles de cabecera en una sola fila `flex-wrap`, provocando un apilamiento caótico en pantallas reducidas.
3. **Ergonomía Táctil Deficiente (Touch Targets < 44px):** Botones pequeños o excesivamente juntos dificultan la pulsación precisa en dispositivos táctiles en terreno, contraviniendo las pautas de accesibilidad WCAG 2.5.5.
4. **Inaccesibilidad en Formularios y Modales en Pantallas Pequeñas:** Los modales centrados fijos con `100vh` sufren recortes cuando se despliegan teclados virtuales o cuando las barras de herramientas dinámicas de navegadores móviles (Safari iOS, Chrome Android) reducen la altura visible, dejando fuera de pantalla los botones críticos de "Confirmar" o "Cancelar".
5. **Zoom Involuntario en iOS:** Inputs con tamaño de fuente inferior a 16px activan el zoom automático del navegador en iOS Safari al recibir foco, descolocando la vista del operador.

---

## 2. Decisión

Se aprueba formalmente la adopción de una arquitectura de presentación **Mobile-First Progresiva** y un estándar de adaptabilidad responsiva integral para el sistema Medidores:

### 2.1. Escala de Breakpoints Formalizada (320px en Adelante)
La interfaz se diseña y optimiza partiendo desde el dispositivo más pequeño y escalando progresivamente:

1. **Extra Small (`xs`: 320px – 374px - Mobile Compacto):**
   - Dispositivos de referencia: iPhone SE (1ª gen), smartphones ultracompactos, terminales industriales portátiles.
   - Disposición vertical en columna única (`1fr`).
   - Padding lateral reducido y optimizado: `0.75rem` (12px).
   - Ocultamiento de la barra horizontal de pestañas y despliegue del **Menú Móvil / Drawer Accesible**.
   - Supresión estricta de cualquier desbordamiento horizontal (`overflow-x: hidden` en shell).
   - Acciones de modales y tarjetas apiladas o en flex responsivo.

2. **Small Mobile (`sm`: 375px – 424px - Mobile Estándar):**
   - Dispositivos de referencia: iPhone SE (2ª/3ª gen), iPhone 12/13/14/15 base, Google Pixel estándar, Samsung Galaxy S base.
   - Padding lateral cómodo: `1rem` (16px).
   - Tarjetas de medidor con lectura destacada en tipografía monoespaciada de gran visibilidad.
   - KPI cards en columna única fluida con márgenes optimizados.

3. **Medium/Large Mobile (`md`: 425px – 767px - Mobile Grande / Phablet):**
   - Dispositivos de referencia: iPhone Pro Max, Samsung Galaxy Plus/Ultra, Pixel Pro.
   - Grids de KPIs en 2 columnas (`repeat(2, 1fr)`).
   - Formularios con campos complementarios en 2 columnas (`.form-grid-2`).

4. **Tablet (`lg`: 768px – 1023px):**
   - Dispositivos de referencia: iPad mini/Air, tablets Android de 8" a 10".
   - Navegación híbrida, visualización de paneles en doble columna para auditoría e incidentes.
   - Transición del menú móvil a barra de escritorio cuando el ancho de pantalla lo permita.

5. **Desktop (`xl`: 1024px+):**
   - Preservación íntegra del layout de alta densidad establecido en ADR 0002, con visualización simultánea de métricas, filtros y tablas extendidas.

---

### 2.2. Patrones de Componentes y Ergonomía Táctil

1. **Navegación Móvil mediante Drawer / Menú Lateral Desplegable:**
   - En viewports `< 768px`, la barra horizontal `.role-switcher` y el simulador de roles se condensan tras un botón accesible de tipo menú hamburguesa (`#btnMobileMenuToggle`) ubicado en la cabecera.
   - Al activarse, despliega una capa accesible (`.mobile-menu-drawer`) con fondo difuminado, permitiendo seleccionar con holgura los 9 módulos, conmutar roles RBAC, cambiar el tema visual y cargar datos demo.
   - Se cierra automáticamente al pulsar un enlace de navegación, al presionar la tecla `Escape` o al tocar el botón de cierre.
   - La cabecera móvil mantiene permanentemente visibles el logotipo compacto, el indicador de conectividad PWA y el botón de sincronización de cola.

2. **Touch Targets Accesibles (Regla WCAG 2.5.5):**
   - En pantallas móviles (`< 768px`), todo botón, control interactivo, selector (`select`) e input de texto debe ofrecer un área de pulsación con altura mínima de **44px** (`min-height: 44px`).
   - Los botones de acción principal en modales y tarjetas se expanden a ancho completo (`width: 100%`) para facilitar el toque con el dedo pulgar.

3. **Prevención de Auto-Zoom en iOS Safari:**
   - Todos los inputs, selects y textareas deben mantener `font-size: 1rem` (16px) como mínimo en pantallas móviles para impedir que los navegadores basados en WebKit fuercen el zoom de página al enfocar un control.

4. **Modales Adaptados a Viewport Dinámico (`dvh`):**
   - Los modales deben utilizar unidades de viewport dinámicas (`max-height: 90dvh` / `max-height: 90vh` como fallback) para evitar ser recortados por la barra de navegación del navegador móvil o el teclado en pantalla.
   - El encabezado del modal (`.modal-header`) y el pie (`.modal-footer`) deben configurarse con fijación visual (`position: sticky`), mientras que el cuerpo (`.modal-body`) contiene el desplazamiento (`overflow-y: auto`), garantizando que los botones de acción nunca se pierdan de vista al scrollear.

5. **Tablas de Datos Responsivas con Desplazamiento Suave:**
   - Las tablas analíticas se encapsulan en contenedores `.table-responsive` con desplazamiento táctil acelerado (`-webkit-overflow-scrolling: touch`), con indicador visual de desbordamiento horizontal para que el usuario sepa que puede deslizar.

---

## 3. Invariantes y Reglas de Gobernanza

1. **Invariante de Cero Scroll Horizontal (Zero Horizontal Overflow):**
   En cualquier ancho de pantalla entre 320px y 3840px, el ancho del contenido renderizado no debe superar el 100% del viewport (`document.documentElement.clientWidth === window.innerWidth`). Queda estrictamente prohibida la aparición de scrollbars horizontales a nivel de página o body.
2. **Invariante de Preservación de Desktop (Cero Regresiones):**
   Las optimizaciones móviles deben realizarse mediante reglas de medios progresivas (`@media (max-width: ...)` o `@media (min-width: ...)`). En resolución de escritorio (>= 1024px), la disposición visual, tamaños y comportamientos deben mantenerse 100% fieles al estándar previo de ADR 0002.
3. **Invariante de Pureza Tecnológica:**
   No se introducen librerías de UI externas (Bootstrap, Tailwind, etc.) ni transpiladores frontend. Todas las adaptaciones se implementan con Vanilla CSS moderno, Custom Properties y JavaScript nativo.
4. **Verificación Automatizada E2E con Viewports Móviles:**
   La suite de pruebas E2E de Playwright debe incluir una suite específica (`e2e/responsive-mobile.spec.ts`) que ejecute pruebas sintéticas en resoluciones explícitas (320x568, 375x667, 425x800), validando la ausencia de desbordamiento horizontal, el funcionamiento del menú móvil, la accesibilidad de los modales y el flujo de captura de lecturas en pantalla pequeña.

---

## 4. Consecuencias

### Positivas
- **Operación Realista en Campo:** Los operadores en terreno pueden registrar lecturas cómodamente desde cualquier teléfono inteligente, sin deformaciones visuales ni botones inalcanzables.
- **Universalidad de Dispositivos:** Cobertura garantizada desde los modelos más compactos (320px) hasta phablets y tabletas modernas.
- **Cumplimiento de Estándares Web:** Alineación con buenas prácticas modernas de CSS (viewport dinámico `dvh`, touch targets accesibles WCAG, prevención de auto-zoom).
- **Protección Anti-Regresión:** Pruebas automatizadas en Playwright que verifican los viewports móviles en cada ejecución del Quality Gate y en el pipeline de CI.

### Negativas / Trade-offs
- Requiere mantenimiento adicional en hojas de estilo para asegurar que nuevos componentes respeten la escala de breakpoints desde 320px.
