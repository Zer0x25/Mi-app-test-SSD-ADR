# ADR 0011: Transformación de Tablas a Fichas Adaptativas Móviles (Stacked Cards)

- **Fecha:** 2026-10-04
- **Estado:** Aceptado
- **Afecta a:** Capa de Presentación (`public/css/components.css`, `public/app.js`, `public/index.html`), Pautas de Accesibilidad Móvil, Ergonomía de Operadores y Supervisores en Terreno, Pruebas E2E de Playwright.

---

## 1. Contexto y Problema

El [ADR 0010](file:///home/zer0x/proyectos/Mi-app-test-SSD-ADR/docs/adr/0010-diseno-responsivo-y-adaptabilidad-movil.md) definió la estrategia Mobile-First para el sistema **Medidores**, incorporando el menú lateral en Drawer, la escala progresiva de breakpoints (320px a 1024px+), touch targets ergonómicos (>= 44px) y la eliminación del desbordamiento horizontal en el documento principal.

Sin embargo, el punto 2.2.5 de dicho ADR resolvió las tablas de datos mediante contenedores `.table-responsive` con desplazamiento horizontal (`overflow-x: auto`). En la práctica operativa en terreno (smartphones de 320px a 425px):
1. **Fricción por Paneo Horizontal:** Las tablas con 6 a 9 columnas (Usuarios, Reportes de Consumo, Conciliación de Facturas, Incidentes/Alertas, Bitácora Técnica, Auditoría, Webhooks y Notificaciones) obligan al usuario a realizar scroll horizontal continuo para ver los datos o alcanzar los botones de acción ("Editar", "Reset Clave", "Resolver Incidente").
2. **Pérdida de Contexto:** Al desplazarse hacia la derecha de la tabla, se pierde de vista el identificador primario del registro (nombre del usuario, código del medidor o folio).
3. **Ergonomía Táctil Limitada:** Los botones en celdas tabulares estrechas resultan difíciles de accionar con una sola mano en campo y contravienen la facilidad de operación táctil.

Es necesario sustituir el patrón de scroll horizontal por un patrón de **Fichas Adaptativas Móviles (Stacked Cards)** sin degradar la visualización en escritorio ni alterar la semántica HTML accesible.

---

## 2. Decisión

Se aprueba formalmente reemplazar el scroll horizontal forzado de tablas en pantallas móviles por la **Transformación Responsiva de Tabla a Ficha (Stacked Table-to-Card Pattern)** para todas las tablas analíticas y de gestión del sistema:

### 2.1. Preservación Semántica y Accesibilidad
1. Se mantienen íntegras las etiquetas semánticas `<table>`, `<thead>`, `<tbody>`, `<tr>` y `<td>`. Esto garantiza la compatibilidad con tecnologías de asistencia / lectores de pantalla y asegura que los selectores de pruebas automatizadas (Playwright y Vitest) sigan funcionando sin regresiones.
2. Cada celda de datos generada dinámicamente (`<td>`) debe incluir obligatoriamente el atributo `data-label="[Nombre del Campo]"` con la denominación legible de la columna correspondiente.

### 2.2. Reglas de Presentación CSS (`max-width: 768px`)
En viewports móviles (`<= 768px`):
1. **Supresión de Scroll Horizontal Forzado:** En `.table-responsive`, se anula el desbordamiento forzado (`overflow-x: visible`).
2. **Ocultamiento de Cabeceras Tabulares:** `thead` se oculta visualmente (`display: none`), evitando la redundancia con las etiquetas de cada ficha.
3. **Transformación de Filas a Fichas (`tr`):** Cada fila (`tbody tr`) se renderiza como bloque independiente (`display: flex; flex-direction: column;`), con fondo de superficie (`var(--bg-surface)`), bordes redondeados (`var(--radius-lg)`), borde contenedor (`var(--border-medium)`), padding interno de `1rem`, separación vertical (`margin-bottom: 0.85rem`) y sombra suave.
4. **Disposición Clave-Valor en Celdas (`td`):**
   - Cada celda se transforma en una fila flexible (`display: flex; justify-content: space-between; align-items: center; min-height: 36px;`).
   - El pseudo-elemento `td[data-label]::before` renderiza el texto de `attr(data-label)` alineado a la izquierda con estilo secundario (mayúsculas, tipografía tenue `var(--text-muted)` y `font-size: 0.75rem`).
   - El contenido de la celda se alinea a la derecha con contraste óptimo (`var(--text-primary)`).
5. **Encabezado y Pie de Ficha:**
   - La primera celda relevante (nombre, código o folio) se estiliza con mayor peso tipográfico y tamaño para actuar como título de la ficha.
   - La celda de acciones interactivas (`td:last-child` o `.table-actions`) se ubica en el pie de la ficha con separación visual (`border-top: 1px solid var(--border-medium)`), organizando los botones en columna o ancho completo con altura mínima táctil de 44px (`min-height: 44px`).
6. **Estados Vacíos y Errores:** Las filas de estado vacío (`.empty-state`) o error en el `tbody` se adaptan a bloque centralizado ocupando el 100% del ancho sin divisiones espurias.

### 2.3. Preservación del Modo Escritorio (`> 768px`)
En pantallas superiores a 768px, las reglas de medios mantienen exactamente la visualización tabular clásica de alta densidad (ADR 0002 y ADR 0010), sin alteraciones en el layout para administradores de oficina.

---

## 3. Reglas Inmutables para Agentes de IA

- **Obligaciones:**
  - Toda celda `<td>` renderizada en JavaScript que represente un dato con cabecera DEBE portar el atributo `data-label="[Título]"`.
  - Todo botón o enlace de acción dentro de una fila de tabla debe cumplir con el área de contacto táctil mínima de 44px (`min-height: 44px`) en viewports móviles.
  - Toda modificación de listados debe certificarse en resoluciones móviles (320px, 375px y 425px) sin desbordamiento horizontal (`zero horizontal overflow`).
- **Prohibiciones:**
  - Prohibido duplicar el DOM (ej. crear dos estructuras separadas `div.mobile-cards` y `table.desktop-table`), evitando desincronización de estado o consumo excesivo de memoria en navegadores móviles.
  - Prohibido eliminar elementos `<th>` o `<thead>` del HTML para "simplificar el diseño", ya que destruye la semántica accesible y el árbol de accesibilidad del navegador.

---

## 4. Consecuencias

### Positivas
- **Excelente Experiencia en Terreno:** La consulta de usuarios, incidentes, mantenimientos y consumos en smartphone es vertical, fluida y legible sin deslizamiento lateral.
- **Acceso Táctil Inmediato:** Botones de acción fáciles de pulsar con un pulgar en terreno, incluso en condiciones de movilidad o uso de guantes.
- **Cero Regresiones de Tests:** Todos los selectores de pruebas existentes (`#tablaUsuarios tbody tr`, botones de acción) siguen apuntando a los mismos nodos semánticos en el DOM.
- **Mantenimiento Limpio:** Lógica única de renderizado en JavaScript; la adaptación es gobernada limpiamente por CSS y atributos `data-label`.

### Negativas / Trade-offs
- Requiere asegurar que toda nueva columna que se agregue a cualquier tabla en el futuro incluya su correspondiente atributo `data-label` en el código frontend.
