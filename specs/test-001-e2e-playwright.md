# Spec: Suite de Pruebas E2E Automatizadas con Playwright (test-001)

> **Instrucción para el Agente:** Este documento es un contrato cerrado para el Hito 10. Implementa las pruebas E2E con Playwright cubriendo los flujos completos de usuario según los criterios de aceptación y las invariantes estipuladas.

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Implementar una suite integral de pruebas End-to-End (E2E) con Playwright en modo headless para validar los flujos reales de usuario en el navegador:
  1. Autenticación, Conmutación de Roles y Control de Acceso RBAC (Operador vs Supervisor vs Admin).
  2. Captura y Validación de Lecturas en Terreno (Modo Operador, selección de sedes, validación de lecturas crecientes).
  3. Detección y Resolución de Alertas / Incidentes Metrológicos (Apertura de modal, notas técnicas, cambio de estado a Resuelto).
  4. Administración, Diagnóstico Sintético y Verificación de Webhooks (Registro de endpoint, test ping y bitácora de entregas).
- **Archivos editables autorizados:**
  - `docs/adr/0007-pruebas-e2e-playwright.md`
  - `specs/test-001-e2e-playwright.md`
  - `package.json`
  - `package-lock.json`
  - `playwright.config.ts`
  - `vitest.config.ts`
  - `e2e/login-rbac.spec.ts`
  - `e2e/lecturas-terreno.spec.ts`
  - `e2e/alertas-incidentes.spec.ts`
  - `e2e/webhooks-administracion.spec.ts`
  - `.github/workflows/verify.yml`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar salvo corrección de selector menor justificado):**
  - `src/core/*`
  - `src/modules/*`
  - `prisma/schema.prisma`
  - `tests/*` (pruebas unitarias preexistentes de Vitest)

---

## 2. Criterios de Aceptación (Definition of Done)

### CA-1: Configuración Determinista de Playwright (`playwright.config.ts`)
- Configuración para ejecutar pruebas en el directorio `./e2e`.
- Proyectos configurados para navegador `chromium` en modo headless.
- `webServer` configurado para arrancar el servidor HTTP en puerto dedicado o reutilizar servidor local si está activo (`reuseExistingServer: !process.env.CI`).
- Configuración de `baseURL` apuntando al servidor web local (ej. `http://localhost:3000`).
- Aislamiento respecto a Vitest: `vitest.config.ts` debe excluir explícitamente el directorio `e2e/**` para que `npm test` continúe ejecutando exclusivamente las pruebas unitarias/integración de Vitest.

### CA-2: Flujo E2E 1 - Login y Control de Acceso RBAC (`e2e/login-rbac.spec.ts`)
- La suite debe cargar la interfaz web y autenticar con los diferentes perfiles:
  - **Operador:** Iniciar sesión o conmutar a rol `OPERADOR`. Verificar que la vista activa es "Modo Terreno" (`#viewOperador`), el badge de rol muestra "OPERADOR" y las pestañas administrativas (`#tabWebhooksBtn`, `#tabUsuariosBtn`, etc.) quedan ocultas o deshabilitadas.
  - **Supervisor:** Conmutar a `SUPERVISOR`. Verificar que visualiza el dashboard y pestañas de mantenimiento, pero no puede crear instalaciones globales ni administrar webhooks.
  - **Admin:** Conmutar a `ADMIN`. Verificar visibilidad completa de todas las pestañas de navegación (`Dashboard`, `Reportes`, `Alertas`, `Mantenimiento`, `Usuarios`, `Auditoría`, `Webhooks`).

### CA-3: Flujo E2E 2 - Registro de Lecturas en Terreno (`e2e/lecturas-terreno.spec.ts`)
- Como usuario `OPERADOR`, navegar al Modo Terreno.
- Seleccionar una instalación asignada en el desplegable (`#selectOperadorInstalacion`).
- Verificar que se renderizan las tarjetas de los medidores asignados a dicha instalación.
- Abrir el modal de registro de lectura para un medidor (`#modalLectura`).
- Validar el comportamiento ante una lectura decreciente o inválida (debe mostrar notificación de error toast).
- Registrar una lectura válida estrictamente creciente con fecha y observaciones.
- Confirmar que la lectura se registra exitosamente, se cierra el modal y se actualiza la tarjeta con el nuevo valor.

### CA-4: Flujo E2E 3 - Detección y Resolución de Alertas (`e2e/alertas-incidentes.spec.ts`)
- Como usuario `ADMIN` o `SUPERVISOR`, acceder a la pestaña de "Alertas" (`#tabAlertasBtn`).
- Verificar el despliegue de los KPIs de incidentes (abiertos, críticos, resueltos) y la tabla de incidentes (`#tablaAlertasIncidentes`).
- Ejecutar la evaluación de reglas en vivo ("Evaluar Reglas Ahora").
- Hacer clic en "Atender" en un incidente abierto para desplegar el modal de resolución (`#modalResolverIncidente`).
- Seleccionar estado `RESUELTO` e ingresar notas técnicas de resolución.
- Guardar y confirmar que la tabla se actualiza reflejando el nuevo estado y el KPI de resueltos se incrementa.

### CA-5: Flujo E2E 4 - Administración y Diagnóstico de Webhooks (`e2e/webhooks-administracion.spec.ts`)
- Como usuario `ADMIN`, acceder a la pestaña "Webhooks" (`#tabWebhooksBtn`).
- Abrir el modal para nuevo webhook (`#modalNuevoWebhook`).
- Completar url (`http://localhost:9999/webhook-test`), descripción ("Webhook E2E"), eventos (`alerta.incidente_detectado`), secreto opcional y guardar.
- Verificar que el nuevo endpoint aparece listado en la tabla `#tbodyWebhooks`.
- Ejecutar la acción de prueba (botón "Enviar Ping de prueba") y validar la respuesta visual de toast.
- Abrir el modal de historial de entregas (`#modalEntregasWebhook`) y verificar que se visualiza el intento registrado.

### CA-6: Script y Automatización en CI
- `package.json` debe contar con el script `"test:e2e": "playwright test"`.
- `npm run test:e2e` debe ejecutarse con salida `0` (100% de tests pasando en Chromium headless).
- `./scripts/verify.sh` debe mantenerse en código de salida `0` sin alteración.
- Actualizar `.github/workflows/verify.yml` para incorporar el job/paso de pruebas E2E.

---

## 3. Invariantes Técnicas

1. **Idempotencia y Estado Limpio:** Toda prueba debe ejecutarse de forma predecible; para ello se puede invocar la ruta `POST /api/demo/seed` antes de las pruebas o asegurar datos de prueba consistentes.
2. **Desacoplamiento Estricto de Runners:** Vitest jamás debe intentar ejecutar pruebas de Playwright ni Playwright debe interferir con la ejecución de Vitest.
3. **Respeto a las Reglas de Gobernanza (AGENTS.md):** No se alteran los endpoints de producción ni la estructura del núcleo de negocio; las pruebas se adaptan a la UI existente.
