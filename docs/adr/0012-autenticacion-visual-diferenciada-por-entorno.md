# ADR 0012: Autenticación Visual Diferenciada por Entorno y Pantalla de Inicio de Sesión (Dev vs. Staging/Prod)

- **Fecha:** 2026-10-04
- **Estado:** Aceptado
- **Afecta a:** Frontend (`public/`), `src/server.ts`, Capa de Presentación, Autenticación y Suites E2E

---

## 1. Contexto y Problema

Durante las fases iniciales de desarrollo y pruebas locales, el sistema Medidores incorporó una barra de simulación rápida de roles (`#roleSimulatorBar` y `.mobile-simulator-section`), permitiendo alternar con un solo clic entre las identidades de `ADMIN`, `SUPERVISOR` y `OPERADOR`, además de autenticar por defecto como administrador ante la ausencia de un token JWT.

Si bien esta utilidad otorga una velocidad de desarrollo y depuración excepcional en entornos locales (`development`), su presencia en entornos pre-productivos (`staging`) y productivos (`production`) resulta inaceptable por las siguientes razones:
1. **Riesgo de Seguridad y Percepción de Vulnerabilidad:** En Staging y Producción, la aplicación debe requerir autenticación explícita y no exponer selectores rápidos con contraseñas fijas ni auto-logins administradores.
2. **Ausencia de Flujo Formal de Login y Logout:** Los usuarios finales y evaluadores de Staging requieren una interfaz de inicio de sesión (*Login View*) gobernada por el Design System Aurora, que valide credenciales reales contra `POST /api/auth/login`, soporte expiración de sesiones (401), rate limiting (429) y ofrezca una acción explícita para cerrar sesión (*Logout*).
3. **Preservación de la Ergonomía en Desarrollo:** Eliminar completamente el conmutador rápido de roles degradaría la experiencia del desarrollador local al forzarlo a teclear credenciales cada vez que necesite validar vistas restringidas de supervisión o captura en terreno.

Se requiere un mecanismo desacoplado y determinista que conserve la agilidad en desarrollo (`dev`) y active la barrera formal de autenticación en Staging y Producción.

---

## 2. Decisión

Se aprueba la arquitectura de **Autenticación Visual Diferenciada por Entorno** fundamentada en los siguientes pilares:

### 2.1. Exposición Determinista de Entorno (`GET /api/config`)
- El backend Fastify expondrá un endpoint público y liviano `GET /api/config` que resolverá el estado del entorno validado por Zod (`src/core/config.ts`):
  ```json
  {
    "env": "development",
    "features": {
      "devRoleSwitcher": true
    }
  }
  ```
- La propiedad `devRoleSwitcher` se evaluará estrictamente como `true` únicamente si `NODE_ENV === "development"` (o en suite de test si aplica). En `staging` y `production`, retornará `false`.

### 2.2. Pantalla de Inicio de Sesión Formal (`#viewLogin`)
- Se implementará una vista dedicada de Login construida íntegramente con los tokens semánticos del Design System Aurora (`--bg-canvas`, `--bg-surface`, `--accent-primary`, `--text-primary`):
  - Formulario estructurado con campos accesibles para correo electrónico (`autocomplete="username"`) y contraseña (`autocomplete="current-password"`).
  - Control visual para alternar visibilidad de contraseña (mostrar/ocultar).
  - Manejo de estados de carga (`loading`), deshabilitación de inputs y feedback tipado de errores (401 credenciales inválidas, 429 bloqueo por tasa de intentos, fallos de red).
  - En entorno de desarrollo (`devRoleSwitcher: true`), la pantalla incluirá una sección auxiliar de accesos directos (*"Acceso Rápido de Desarrollo"*) para iniciar sesión con un solo clic como Admin, Supervisor u Operador.

### 2.3. Control de Acceso y Visibilidad por Entorno en el Frontend
- **En Staging y Producción (`staging` / `production`):**
  - La barra simuladora (`#roleSimulatorBar`) y el bloque móvil (`.mobile-simulator-section`) serán **ocultados y removidos del flujo visual**.
  - Queda **estrictamente prohibido el auto-login** sintético hacia cuentas demo si no existe un token válido.
  - Toda visita sin token o con sesión expirada mostrará inmediatamente la pantalla de Login (`#viewLogin`), manteniendo oculta la barra de navegación y las vistas operativas de la aplicación.
- **En Desarrollo (`development`):**
  - La barra simuladora de roles y el menú rápido del drawer móvil permanecerán activos para máxima agilidad de prueba.

### 2.4. Flujo de Cierre de Sesión (Logout) y Manejo de Expiración
- Se incorporará el botón **Cerrar Sesión** en la píldora de usuario activa (`#navUserPill`) en escritorio y en el drawer móvil (`#mobileUserSection`).
- Al accionar el cierre de sesión o ante el evento `medidores:session-expired`:
  - Se purgará el token del almacenamiento del cliente (`window.api.auth.logout()`).
  - Se limpiará el estado en memoria de `currentUser`.
  - Se ocultará el shell operativo y se desplegará la pantalla de Login con un toast informativo.

---

## 3. Reglas Inmutables para Agentes de IA

### Obligaciones
- Toda vista o formulario de autenticación debe apegarse estrictamente a las directivas de seguridad de contraseñas (regla 17 de `AGENTS.md`), incluyendo `autocomplete="username"` y `autocomplete="current-password"`.
- La detección del entorno debe realizarse contra el backend mediante `GET /api/config`; prohibido hardcodear banderas de desarrollo en el frontend.
- En Staging y Producción, la aplicación debe arrancar en estado no autenticado a menos que exista un token JWT válido previamente persistido.
- La suite de pruebas E2E debe incorporar pruebas que certifiquen el flujo real de Login con credenciales, el cierre de sesión y la ausencia del simulador en Staging.

### Prohibiciones
- **Prohibido exponer botones de auto-login o simulación de credenciales en `staging` o `production`.**
- **Prohibido usar `window.alert()` para notificar fallos de login;** todo error debe propagarse a través de `ToastManager` o alertas inline accesibles.
- **Prohibido desloguear al usuario ante errores 401 originados por discrepancias de contraseña actual** en el cambio de clave (`isPasswordMismatch`, regla 4 de `AGENTS.md`).

---

## 4. Consecuencias

### Positivas
- **Paridad Real en Pre-producción y Producción:** Staging se comporta exactamente como el entorno productivo real, garantizando auditoría fidedigna de accesos y pruebas de penetración confiables.
- **Velocidad sin Compromiso:** El flujo de desarrollo local no pierde velocidad ni agilidad, conservando el simulador de 1 clic.
- **Seguridad Perimetral Robusta:** La barrera de autenticación se consolida visual y lógicamente.

### Negativas / Trade-offs
- Requiere una llamada inicial liviana a `GET /api/config` durante la hidratación de la interfaz web para evaluar la bandera del simulador.
