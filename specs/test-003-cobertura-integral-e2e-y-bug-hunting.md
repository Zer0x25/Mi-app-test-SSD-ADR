# Spec: Búsqueda Exhaustiva de Bugs y Cobertura Integral E2E (test-003)

> **Instrucción para el Agente:** Este documento constituye el contrato cerrado para el **Hito 14**. El objetivo prioritario es expandir la cobertura de pruebas de extremo a extremo (E2E) con Playwright sobre los flujos de usuario aún no cubiertos, detectar proactivamente bugs funcionales o de interfaz, y blindar la aplicación contra fallos silenciosos.

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** 
  1. Implementar suites de pruebas sintéticas E2E para los flujos críticos faltantes en la aplicación:
     - **Aprovisionamiento y Catálogo Base:** Creación de Instalaciones / Sedes (`#modalInstalacion`), Configuración de Tipos de Medidor (`#modalTipo`) y Alta de Medidores Físicos (`#modalMedidor`) con validación de unicidad y códigos duplicados.
     - **Seguridad, Autoservicio y Gestión de Usuarios:** Autoservicio de cambio de contraseña (`#modalCambiarPassword`) con validación de clave actual incorrecta vs correcta, y edición integral de usuario (`#modalEditarUsuario`) con reasignación transaccional de instalaciones.
     - **Ciclo de Vida Metrológico Avanzado:** Bajas técnicas y reemplazos con lectura de retiro obligatoria, junto a rotura y reemplazo de precintos de seguridad numerados.
     - **Configuración Dinámica de Alertas:** Modificación de umbrales y reglas de detección de anomalías (`#modalConfigurarReglas`) y su impacto en la evaluación en vivo.
     - **Robustez ante Estados Vacíos y Filtros Extremos:** Cero excepciones no controladas en consola ante búsquedas sin resultados o filtros cruzados vacíos.
  2. Identificar y corregir de forma quirúrgica cualquier bug de interfaz, desajuste de selector o incoherencia en los controladores/modales encontrados durante la ejecución de las pruebas.

- **Archivos editables autorizados:**
  - `specs/test-003-cobertura-integral-e2e-y-bug-hunting.md`
  - `e2e/catalogo-aprovisionamiento.spec.ts` (Nuevo)
  - `e2e/seguridad-usuarios-perfil.spec.ts` (Nuevo)
  - `e2e/mantenimiento-ciclo-vida.spec.ts` (Nuevo)
  - `e2e/alertas-incidentes.spec.ts` (Expansión)
  - `public/app.js` (Solo para corrección de bugs descubiertos en modales o selectores)
  - `public/index.html` (Solo para corrección de accesibilidad o selectores en modales si aplica)
  - `public/css/components.css` (Solo para correcciones cosméticas o de contención si aplica)
  - `src/modules/*` (Solo si se detecta un bug de lógica en backend durante los flujos E2E)
  - `STATE.md`

- **Archivos protegidos (solo lectura):**
  - `src/core/config.ts`
  - `src/core/errors.ts`
  - `docs/adr/*`

---

## 2. Criterios de Aceptación (Definition of Done)

### CA-1: Flujo E2E - Catálogo y Aprovisionamiento (`e2e/catalogo-aprovisionamiento.spec.ts`)
- **Creación de Sede / Instalación:**
  - Como `ADMIN`, abrir `#modalInstalacion` desde `#btnNuevaInstalacion`.
  - Crear una nueva instalación con nombre único, dirección y tipo.
  - Verificar que el modal se cierre, se muestre toast de éxito y la instalación aparezca en los selectores del sistema.
  - Validar rechazo o prevención ante intento de crear sede sin nombre o inválida.
- **Configuración de Tipo de Medidor:**
  - Abrir `#modalTipo` desde `#btnNuevoTipo`.
  - Configurar un nuevo tipo (ej. `AGUA_POTABLE_IND`, recurso `AGUA`, unidad `M3`, modo `ACUMULATIVO`).
  - Verificar que se agregue al catálogo y esté disponible en el formulario de nuevos medidores.
- **Alta de Medidor Físico y Manejo de Conflictos:**
  - Abrir `#modalMedidor` desde `#btnNuevoMedidor`.
  - Registrar un medidor con código único, número de serie, asignado a la nueva sede y tipo creado.
  - Verificar que la tarjeta del nuevo medidor aparezca en el Dashboard / Catálogo.
  - Intentar registrar un segundo medidor con el **mismo código**; verificar que el sistema capture el conflicto (HTTP 409) y presente un toast de advertencia claro al usuario sin romper el modal ni la vista.

### CA-2: Flujo E2E - Seguridad, Perfil y Edición de Usuario (`e2e/seguridad-usuarios-perfil.spec.ts`)
- **Autoservicio de Cambio de Contraseña:**
  - Abrir `#modalCambiarPassword` desde el botón o menú de perfil de usuario.
  - Intentar cambiar la clave ingresando una contraseña actual errónea.
  - Verificar que la API responda 400 (`PasswordActualInvalidaError`) y la UI presente el mensaje de error correspondiente al usuario, manteniendo abierto el modal para corrección.
  - Ingresar la contraseña actual correcta (`Admin123!`), confirmar nueva contraseña válida (`Admin456!`) y verificar éxito y cierre de modal.
- **Edición Administrativa de Usuario y Asignaciones:**
  - En la vista de usuarios (`#viewUsuarios`), hacer clic en el botón "Editar" de un usuario existente.
  - Verificar que `#modalEditarUsuario` se abra pre-cargado con los datos del usuario.
  - Modificar rol o agregar una sede adicional en los checkboxes.
  - Guardar cambios y verificar que la tabla de usuarios actualice inmediatamente los badges y que la persistencia confirme las nuevas asignaciones.

### CA-3: Flujo E2E - Ciclo de Vida Metrológico y Bajas Técnicas (`e2e/mantenimiento-ciclo-vida.spec.ts`)
- **Baja Técnica y Retiro con Precintos:**
  - En la vista de Mantenimiento (`#viewMantenimiento`), abrir `#modalRegistrarMantenimiento`.
  - Seleccionar un medidor activo y tipo de evento `BAJA_TECNICA` o `REEMPLAZO`.
  - Registrar lectura de retiro obligatoria, motivo técnico y rotura de precinto anterior.
  - Verificar que el mantenimiento se registre en la bitácora técnica con su correspondiente evento de auditoría.
  - Verificar que el estado del medidor refleje su baja y que cualquier intento posterior de registrar lecturas operativas normales quede bloqueado semánticamente.

### CA-4: Flujo E2E - Configuración Dinámica de Reglas de Alerta (`e2e/alertas-incidentes.spec.ts`)
- **Actualización de Umbrales en Vivo:**
  - Como `ADMIN`, acceder a la pestaña de Alertas y abrir `#modalConfigurarReglas`.
  - Modificar los valores de umbral de una regla (ej. tolerancia de horas sin reporte o porcentaje de salto).
  - Guardar la configuración y verificar que la tabla de reglas muestre los nuevos valores.
  - Disparar una evaluación en vivo (`#btnEvaluarAlertas`) y verificar que el motor aplique los umbrales actualizados.

### CA-5: Flujo E2E - Robustez de UI ante Estados Vacíos y Cero Excepciones JS
- En consultas con filtros extremos (fechas sin lecturas en reportes, búsqueda de auditoría inexistente, sedes sin medidores):
  - La interfaz debe desplegar el empty state (`renderEmptyState`) amigable y consistente del Aurora Design System.
  - No deben generarse excepciones no capturadas (`window.onerror` o `unhandledrejection`) en la consola del navegador.

---

## 3. Barrera de Calidad (Quality Gate)
- La tarea se considerará completa cuando:
  1. Todas las pruebas E2E preexistentes (29/29) más las nuevas suites pasen al 100%.
  2. Todos los tests de Vitest (206/206) pasen sin regresión.
  3. `./scripts/verify.sh` finalice con código de salida 0.
