# Spec: feat-017 - Fichas Adaptativas Móviles (Table-to-Card) para Tablas de Datos

> **Instrucción para el Agente:** Este documento es un contrato cerrado bajo la metodología Spec-Driven Development (SDD) y Agentic TDD. No implementes código de producción sin antes escribir las pruebas automatizadas que satisfagan estos criterios de aceptación.

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Implementar la transformación responsiva de todas las tablas de datos (`.data-table`) del sistema Medidores en fichas móviles apiladas (Stacked Cards) para pantallas `<= 768px` conforme a [ADR 0011](file:///home/zer0x/proyectos/Mi-app-test-SSD-ADR/docs/adr/0011-fichas-moviles-tablas-responsive.md), eliminando la necesidad de scroll horizontal en smartphones y garantizando ergonomía táctil (botones >= 44px) sin romper la semántica accesible ni la visualización en escritorio.
- **Archivos editables autorizados:**
  - `public/css/components.css`
  - `public/app.js`
  - `e2e/responsive-mobile-cards.spec.ts`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/*`
  - `src/modules/*`
  - `docs/adr/*`
  - `tests/*` (pruebas unitarias backend)

---

## 2. Invariantes del Negocio y Diseño Responsivo

### A. Invariantes Positivas (Garantías de Comportamiento)
1. **Preservación Semántica y Accesibilidad:** Las tablas conservan intacta su estructura HTML (`<table>`, `<thead>`, `<tbody>`, `<tr>`, `<td>`), permitiendo a las tecnologías de asistencia comprender la relación de los datos.
2. **Atributos `data-label` Obligatorios:** Toda celda `<td>` generada dinámicamente en `public/app.js` que corresponda a una cabecera de datos debe incluir el atributo `data-label="[Denominación]"` exacto.
3. **Ergonomía Táctil en Acciones (>= 44px):** Todo botón interactivo en el pie de la ficha móvil debe contar con una altura mínima de 44px (`min-height: 44px`) y área de contacto táctil accesible (WCAG 2.5.5).
4. **Cero Scroll Horizontal (Zero Horizontal Overflow):** En cualquier resolución móvil entre 320px y 768px, el ancho total del viewport no debe desbordarse (`document.documentElement.scrollWidth <= window.innerWidth`).

### B. Invariantes Negativas (Prohibiciones Duras)
1. **Prohibición de Duplicidad en el DOM:** Queda estrictamente prohibido crear árboles paralelos en HTML/JS (ej: un bloque `div.mobile-cards` y un bloque `table.desktop-table`). Toda la adaptación debe lograrse mediante CSS progresivo y atributos semánticos.
2. **Prohibición de Alterar la Vista de Escritorio (>= 769px):** En resoluciones de escritorio, las tablas deben continuar visualizándose exactamente con disposición tabular clásica, bordes, fondos de cabecera y alineación de columnas previa.
3. **Prohibición de Eliminar `thead` del Marcado:** El elemento `<thead>` jamás debe removerse del DOM, únicamente ocultarse visualmente en CSS (`display: none`) bajo `@media (max-width: 768px)`.

---

## 3. Catálogo de Tablas Alcanzadas y Atributos `data-label`

1. **Directorio de Usuarios (`#tablaUsuarios`):**
   - Celdas: `data-label="Usuario"`, `data-label="Email"`, `data-label="Rol"`, `data-label="Estado"`, `data-label="Instalaciones Asignadas"`, `data-label="Acciones"`.
2. **Reporte de Consumos Consolidados (`#tablaReporteConsumos`):**
   - Celdas: `data-label="Período"`, `data-label="Instalación"`, `data-label="Recurso"`, `data-label="Consumo Neto"`, `data-label="Lectura Inicial"`, `data-label="Lectura Final"`, `data-label="Delta"`.
3. **Conciliación de Facturas (`#tablaReporteFacturas`):**
   - Celdas: `data-label="Folio"`, `data-label="Período"`, `data-label="Instalación"`, `data-label="Recurso"`, `data-label="Facturado"`, `data-label="Auditado"`, `data-label="Desvío"`, `data-label="Estado"`.
4. **Incidentes y Anomalías en Vivo (`#tablaAlertasIncidentes`):**
   - Celdas: `data-label="Fecha / Hora"`, `data-label="Medidor"`, `data-label="Instalación"`, `data-label="Tipo Alerta"`, `data-label="Severidad"`, `data-label="Lectura / Detalle"`, `data-label="Estado"`, `data-label="Acciones"`.
5. **Bitácora Técnica y Calibraciones (`#tablaMantenimientosBitacora`):**
   - Celdas: `data-label="Fecha"`, `data-label="Medidor"`, `data-label="Tipo Intervención"`, `data-label="Precinto Retirado"`, `data-label="Precinto Nuevo"`, `data-label="Técnico"`, `data-label="Observaciones"`.
6. **Pista de Auditoría Inmutable (`#tablaAuditoria`):**
   - Celdas: `data-label="Fecha / Hora"`, `data-label="Actor"`, `data-label="Acción"`, `data-label="Entidad Afectada"`, `data-label="IP Origen"`, `data-label="Metadatos"`.
7. **Endpoints de Webhooks (`#tablaWebhooks`):**
   - Celdas: `data-label="URL Endpoint"`, `data-label="Eventos Suscritos"`, `data-label="Estado"`, `data-label="Entregas"`, `data-label="Acciones"`.
8. **Historial de Notificaciones Push / Telegram (`#tablaHistorialNotificaciones`):**
   - Celdas: `data-label="Fecha / Hora"`, `data-label="Canal"`, `data-label="Evento"`, `data-label="Destino"`, `data-label="Estado"`, `data-label="Detalle / Error"`.

---

## 4. Criterios de Aceptación (Definition of Done)

- [ ] **Fase Roja (Tests Primero en Playwright E2E):**
  - [ ] Crear `e2e/responsive-mobile-cards.spec.ts` con pruebas sintéticas en viewport móvil (375x667 y 425x800).
  - [ ] Verificar que en móvil `thead` tiene `display: none` o no es visible.
  - [ ] Verificar que cada fila `tbody tr` tiene ancho cercano al contenedor y `display: flex` / bloque de ficha.
  - [ ] Verificar que las celdas contienen el atributo `data-label`.
  - [ ] Verificar que los botones de acción en la ficha tienen altura mínima de 44px (`min-height: 44px`).
  - [ ] Verificar que en viewport desktop (1280x800) las filas mantienen su comportamiento tabular de escritorio.
  - [ ] Ejecutar la prueba y comprobar que falla en las condiciones antes de implementar (Fase Roja).
- [ ] **Fase Verde (Implementación Mínima):**
  - [ ] Incorporar estilos CSS en `public/css/components.css` bajo `@media (max-width: 768px)` para `.data-table`, `tbody tr`, `tbody td`, pseudo-elementos `::before` con `content: attr(data-label)` y `.table-actions`.
  - [ ] Incorporar atributos `data-label="..."` en todos los generadores de filas de `public/app.js`.
  - [ ] Ejecutar la suite y verificar que todas las pruebas pasen (Fase Verde).
- [ ] **Quality Gate Determinista (Salida 0 Obligatoria):**
  - [ ] `npm run typecheck` sin errores.
  - [ ] `npm run lint` sin advertencias ni fallos.
  - [ ] `npm test` (suite unitaria de Vitest, 206/206 pasando).
  - [ ] `npx playwright test` (todas las suites E2E pasando, incluidas las previas y la nueva suite de fichas móviles).
- [ ] **Actualización de Documentación:**
  - [ ] Actualizar `STATE.md` reflejando el Hito 13.1 completado exitosamente.
