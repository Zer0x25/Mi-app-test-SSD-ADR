# ADR 0007: Suite de Pruebas E2E Automatizadas con Playwright

- **Fecha:** 2026-10-03
- **Estado:** Aceptado
- **Afecta a:** Pruebas End-to-End (`e2e/`), Configuración de Playwright (`playwright.config.ts`), Pipeline CI (`.github/workflows/verify.yml`), Scripts (`package.json`)
- **Relacionado con:** ADR 0001 (Arquitectura Base), ADR 0002 (Frontend Design System), ADR 0003 (Docker & CI/CD)

---

## 1. Contexto y Problema

El sistema **Medidores** cuenta con una sólida base de pruebas unitarias y de integración sobre Fastify, Prisma y lógica de dominio (174 pruebas en 23 suites con Vitest). Sin embargo:
1. Las interacciones directas del usuario en el navegador (manipulación del DOM, eventos de teclado/ratón, modales, alertas visuales con Toasts, selección de pestañas y conmutación de roles RBAC en `public/app.js` y `public/index.html`) no estaban cubiertas por pruebas sintéticas automatizadas de navegador real.
2. Se requiere verificar de extremo a extremo (E2E) que los flujos críticos de negocio funcionen de manera integrada entre la capa cliente y el servidor HTTP en tiempo de ejecución:
   - **Autenticación y Conmutación RBAC:** Verificación de acceso y permisos diferenciales entre Operador, Supervisor y Administrador.
   - **Registro de Lecturas en Terreno:** Selección de instalaciones asignadas, validación de lecturas crecientes y retroalimentación inmediata.
   - **Ciclo de Vida de Alertas e Incidentes:** Detección de anomalías en vivo, visualización en tabla y resolución asistida con notas técnicas.
   - **Gestión y Diagnóstico de Webhooks:** Registro de endpoints salientes, despacho de pings sintéticos y visualización de historial de entregas.
3. Las pruebas deben ejecutarse en modo desatendido (*headless*), con alta velocidad y reproducibilidad tanto en entornos de desarrollo local como en el flujo de integración continua (GitHub Actions).

---

## 2. Decisión

Se adopta **Playwright** (`@playwright/test`) como estándar oficial para pruebas sintéticas de extremo a extremo:

### 2.1. Framework y Motor de Navegación
- Se incorpora `@playwright/test` como dependencia de desarrollo (`devDependencies`).
- El navegador objetivo estándar para ejecución headless es **Chromium**, garantizando compatibilidad web moderna y alta velocidad de ejecución.

### 2.2. Aislamiento y Configuración del Servidor de Pruebas
- Se configura `playwright.config.ts` utilizando la directiva `webServer` para levantar automáticamente el servidor de la aplicación (`npm run start:dev` con `NODE_ENV=test` o puerto dedicado `PORT=3000` / `PORT=3002`), esperando a que responda el endpoint de preparación (`/readyz` o `/api/health`).
- Las pruebas utilizarán el endpoint de inicialización `/api/demo/seed` antes o durante las ejecuciones para garantizar un estado inicial predecible y reproducible con usuarios demo (`admin@medidores.cl`, `supervisor@medidores.cl`, `operador@medidores.cl`).

### 2.3. Organización y Separación de Suites
- Los archivos de prueba E2E se alojarán en el directorio raíz `e2e/` con extensión `*.spec.ts` (ej: `e2e/login-rbac.spec.ts`, `e2e/lecturas-terreno.spec.ts`, `e2e/alertas-incidentes.spec.ts`, `e2e/webhooks-administracion.spec.ts`).
- Se asegura que Vitest ignore la carpeta `e2e/` mediante exclusión explícita (`vitest.config.ts`) para mantener desacopladas las suites unitarias/integración de las pruebas de navegador.
- En `package.json` se agrega el script oficial `"test:e2e": "playwright test"`.

### 2.4. Integración en Pipeline de CI (GitHub Actions)
- En `.github/workflows/verify.yml` se incluye un paso opcional o complementario para instalar los binarios de Playwright (`npx playwright install --with-deps chromium`) y ejecutar `npm run test:e2e`.

---

## 3. Consecuencias

### Positivas
- **Validación de Experiencia de Usuario Real:** Verifica que los scripts de cliente (`app.js`, `api.js`, `sw.js`), modales y estilos CSS funcionen armoniosamente con el backend.
- **Detección Temprana de Regresiones en UI/UX:** Garantiza que los controles de acceso en la interfaz no permitan acciones indebidas según el rol activo.
- **Determinismo y Resiliencia:** Playwright proporciona esperas inteligentes automáticas (*auto-waiting*) y aserciones web-first, evitando esperas arbitrarias (`sleep`).

### Negativas / Mitigaciones
- **Tiempo de Ejecución y Recursos:** Las pruebas de navegador consumen más memoria y tiempo que las pruebas con Vitest. Se mitiga ejecutando en Chromium headless, restringiendo las pruebas E2E a flujos críticos de alto valor y manteniendo `npm test` enfocado en pruebas unitarias veloces.
