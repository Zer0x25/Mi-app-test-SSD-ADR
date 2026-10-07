# Spec: Demo Solo en Dev y Estado de Red Real con Healthcheck (feat-027)

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** (1) Restringir el botón "Cargar Datos Demo" solo a modo dev (`devRoleSwitcher === true`); (2) convertir el badge "En línea" en un healthcheck real frontend→backend contra `GET /readyz` en vez de solo `navigator.onLine`.
- **Archivos editables autorizados:**
  - `src/server.ts` (guardia de entorno en `POST /api/demo/seed`)
  - `tests/server.demo-seed-guard.test.ts` (tests del guardia + probes públicos)
  - `public/index.html` (fail-closed `display:none` en botones demo + testids)
  - `public/app.js` (visibilidad por entorno + guardia en `seedDemoData()`)
  - `public/js/api.js` (cliente `salud.verificarReadyz()` si aplica)
  - `public/js/sync-manager.js` (polling real de salud + 3 estados de badge)
  - `public/app.css` (estado `.degraded` / `.checking`)
  - `e2e/pwa-offline-resiliencia.spec.ts` (ajuste/extends si aplica)
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/*`
  - `docs/adr/*` (inmutables salvo nuevo ADR ya formalizado)
  - Todo archivo fuera de la lista anterior

---

## 2. Contrato Funcional

### A. Demo solo en dev
1. `GET /api/config` sigue siendo la única fuente de verdad (`features.devRoleSwitcher === true` solo en `development`/`test`).
2. Frontend fail-closed: `#btnSeedDemo` y `#btnSeedDemoMobile` nacen con `style="display:none"` y solo JS los revela cuando `devRoleSwitcher === true`.
3. `seedDemoData()` debe abortar con Toast si `devRoleSwitcher === false` (defensa en profundidad ante invocación por consola).
4. Backend fail-closed: `POST /api/demo/seed` responde `403 { error: "DEMO_SEED_DISABLED" }` cuando `config.NODE_ENV === "staging"` o `"production"`. En `development`/`test` mantiene `200` con `seedData` (idempotente, sin regresión E2E).

### B. Badge "En línea" real (health frontend→backend)
1. Fuente actual (`navigator.onLine`) se conserva como señal de red local, pero el badge suma verificación activa contra `GET /readyz` (público, sin auth, con `AbortController` timeout ≤ 5s):
   - `!navigator.onLine` → `Modo Offline` clase `offline`.
   - `navigator.onLine && fetch /readyz 200` → `En línea` clase `online`.
   - `navigator.onLine && fetch falla/timeout` → `Sin servidor` clase `degraded`.
   - `navigator.onLine && fetch 503` → `Servidor degradado` clase `degraded`.
2. Polling determinista: verificación inmediata en `init()`, re-verificación en eventos `online`/`offline`, intervalo 30s (un solo timer, sin fugas), y re-verificación tras `sincronizar()`.
3. Selectores estables: se conserva `#networkStatusBadge`; se añade `data-testid="network-status-badge"`. Textos en español, `title` con latencia o causa.
4. CSP `connect-src` ya permite `'self'`; no requiere cambios.
5. El Service Worker jamás debe cachear ni servir probes de salud (`/readyz`, `/healthz` bypass como `/api/` + `CACHE_NAME` bump para purgar entradas stale + `cache: "no-store"` en el fetch). Sin esto el badge se queda fijo en "En línea" con el backend caído.

---

## 3. Catálogo de Errores Tipados

- Backend seed bloqueado: `HTTP 403 { error: "DEMO_SEED_DISABLED", message: "Carga de datos demo deshabilitada fuera de desarrollo." }` (guardia RBAC/entorno, sin `DomainError` de dominio, mismo patrón que `POST /api/admin/backup`).
- Frontend salud: sin errores tipados; fallos de red se registran en `window.__DIAGNOSTICS__` como `NETWORK_ERROR` existentes, sin Toast espurio en cada poll (solo log `console.warn` + badge).

---

## 4. Invariantes

1. **Fail-closed visual:** sin `/api/config` o con `devRoleSwitcher === false`, demo jamás visible (mismo patrón ADR 0012 que `roleSimulatorBar`).
2. **Fail-closed backend:** en staging/prod, `POST /api/demo/seed` jamás muta datos (403 antes de cualquier `upsert`).
3. **Sin regresión E2E:** en `test`/`development` el seed sigue 200 (todas las suites `beforeEach(request.post("/api/demo/seed"))` siguen verdes); badge en carga normal sigue `En línea`.
4. **Sin spam:** el poll de salud no dispara Toasts ni corrompe la cola offline; un solo intervalo activo.

---

## 5. Criterios de Aceptación (Definition of Done)

- [ ] **Tests backend (Vitest, Fase Roja → Verde):**
  - [ ] `POST /api/demo/seed` en `test` responde 200 (sin regresión).
  - [ ] Guardia por entorno: con `NODE_ENV=staging|production` responde 403 `DEMO_SEED_DISABLED` (vía mock de config o función pura testeable).
  - [ ] `GET /readyz` y `GET /api/health` siguen públicos 200 (base del healthcheck).
- [ ] **Frontend:**
  - [ ] Con `/api/config → devRoleSwitcher:false`, `#btnSeedDemo` y `#btnSeedDemoMobile` ocultos; con `true`, visibles.
  - [ ] Badge arranca `En línea` con backend sano; pasa a `Modo Offline` con `setOffline(true)+offline`; vuelve a `En línea` al recuperar; muestra `Sin servidor` si `/readyz` falla con red local OK.
- [ ] **E2E (Playwright):** `pwa-offline-resiliencia` sigue verde; `login-pantalla-real` (staging mock) sigue verde.
- [ ] **Quality Gate:** `./scripts/verify.sh` salida 0 + `npx playwright test e2e/pwa-offline-resiliencia.spec.ts e2e/login-pantalla-real.spec.ts` verde.
