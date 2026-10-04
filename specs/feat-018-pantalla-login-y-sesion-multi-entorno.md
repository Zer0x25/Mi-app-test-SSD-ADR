# Spec: Pantalla de Login Formal y Sesión Multi-Entorno (Dev vs. Staging/Prod)

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Implementar la interfaz de Inicio de Sesión formal (*Login View*), el flujo de Cierre de Sesión (*Logout*) y la discriminación visual de herramientas de desarrollo según el entorno (`development` vs `staging`/`production`).
- **Archivos editables autorizados:**
  - `src/server.ts` (exponer `GET /api/config`)
  - `tests/server.config.test.ts` (tests unitarios de configuración de entorno)
  - `public/index.html` (markup de `#viewLogin`, inputs semánticos y botones de logout)
  - `public/css/components.css` (estilos para el formulario y vista de login)
  - `public/app.js` (orquestación de estado de autenticación, logout y visibilidad por entorno)
  - `e2e/login-pantalla-real.spec.ts` (suite E2E Playwright de autenticación real y multi-entorno)
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/errors.ts`
  - `src/core/config.ts`
  - `docs/adr/*` (inmutables salvo nuevo ADR ya formalizado)

---

## 2. Contrato de Datos y Endpoint (`GET /api/config`)

### Endpoint Backend: `GET /api/config`
- **Método:** `GET`
- **Autenticación:** Pública (sin token requerido).
- **Respuesta (JSON):**
```json
{
  "env": "development",
  "features": {
    "devRoleSwitcher": true
  }
}
```
- **Regla:** `devRoleSwitcher` debe ser `true` únicamente si `config.NODE_ENV === "development"` o `"test"`. En `"staging"` y `"production"` debe ser estrictamente `false`.

---

## 3. Comportamiento Funcional y Estados de la UI

### A. Pantalla de Login (`#viewLogin`)
1. **Contenedor Centrado y Accesible:**
   - Card con estilo Aurora Design System (`--bg-surface`, `--border-subtle`, sombras y bordes redondeados).
   - Logotipo institucional e identificación "Sistema Medidores".
2. **Campos de Formulario:**
   - Correo electrónico: `<input type="email" id="loginEmail" autocomplete="username" required>`.
   - Contraseña: `<input type="password" id="loginPassword" autocomplete="current-password" required>`.
   - Alternador de visibilidad de contraseña: botón con icono para conmutar `type="password"` y `type="text"`.
   - Botón de envío: `<button type="submit" id="btnLoginSubmit">Iniciar Sesión</button>`.
   - Contenedor de alerta inline accesible para mostrar fallos de autenticación (HTTP 401, 429, etc.).
3. **Sección de Desarrollo (`#loginDevQuickAccess`):**
   - Visible **únicamente** cuando `devRoleSwitcher === true`.
   - Ofrece botones rápidos: `Admin Demo`, `Supervisor Demo`, `Operador Demo` para rellenar credenciales o iniciar sesión directamente.
   - Oculta completamente en Staging y Producción.

### B. Comportamiento por Entorno
1. **Modo Desarrollo (`development`):**
   - La barra de simulación (`#roleSimulatorBar`) y el bloque del drawer móvil (`.mobile-simulator-section`) se mantienen visibles y operativos.
2. **Modo Staging y Producción (`staging` / `production`):**
   - La barra `#roleSimulatorBar` y el bloque móvil `.mobile-simulator-section` se ocultan completamente del DOM.
   - Prohibido el auto-login automático sin token previo. Si el usuario no tiene JWT válido en `localStorage`, se muestra forzosamente `#viewLogin` y se oculta la cabecera y el contenido de las vistas operativas (`mainContent`).

### C. Flujo de Cierre de Sesión (Logout)
1. Se incorpora el botón **Cerrar Sesión** en la píldora de usuario activa (`#navUserPill`) y en el drawer móvil (`#mobileUserSection`).
2. Al pulsar **Cerrar Sesión**:
   - Se invoca `window.api.auth.logout()`, purgando el token JWT.
   - Se limpia `currentUser` y permisos en memoria.
   - Se oculta la navegación principal y se despliega la pantalla `#viewLogin`.
   - Se emite un Toast de notificación informando del cierre exitoso.

---

## 4. Invariantes del Negocio y Seguridad

1. **Invariante de Aislamiento:** En `staging` y `production`, ningún usuario anónimo puede acceder al contenido del dashboard ni ver medidores sin haber obtenido un JWT legítimo mediante `POST /api/auth/login`.
2. **Invariante de Manejo de Errores Tipados:**
   - El formulario de login no debe arrojar excepciones genéricas. Debe capturar `ApiError` del cliente y mostrar mensajes amigables:
     - `401 Unauthorized` -> "Credenciales inválidas. Verifique su correo y contraseña."
     - `429 Too Many Requests` -> "Demasiados intentos fallidos. Por favor espere antes de reintentar."
     - Errores de red -> "No se pudo conectar con el servidor."
3. **Invariante de Expiración:** Ante evento `medidores:session-expired`, la UI debe transicionar de inmediato a `#viewLogin` indicando que la sesión ha expirado.

---

## 5. Criterios de Aceptación (Definition of Done)

- [ ] **Tests Unitarios de Backend (Vitest):**
  - [ ] `GET /api/config` responde 200 con `{ env, features: { devRoleSwitcher } }`.
  - [ ] `features.devRoleSwitcher` es coherente con el entorno de ejecución.
- [ ] **Implementación Frontend:**
  - [ ] Vista `#viewLogin` con campos de email, password y toggle de visibilidad.
  - [ ] Botón de cierre de sesión en desktop y móvil funcionando correctamente.
  - [ ] Ocultamiento del simulador de roles cuando `devRoleSwitcher === false`.
- [ ] **Pruebas E2E (Playwright):**
  - [ ] `e2e/login-pantalla-real.spec.ts` valida:
    1. Renderizado de la pantalla de login cuando no hay token.
    2. Rechazo de credenciales inválidas (401) con mensaje visual de error.
    3. Login exitoso con credenciales válidas y acceso a la interfaz.
    4. Cierre de sesión retornando al login.
    5. Ocultamiento de la barra de simulación cuando se simula entorno Staging/Prod.
- [ ] **Quality Gate Determinista (Salida Código 0):**
  - [ ] `./scripts/verify.sh` pasa al 100% sin regresiones (28/28 suites Vitest).
  - [ ] Playwright E2E pasa al 100%.
