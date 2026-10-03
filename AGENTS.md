# Protocolo Operativo para Agentes de Software (AGENTS.md) - Sistema Medidores

Este repositorio opera bajo la metodología **Spec-Driven Development (SDD)**, **Architecture Decision Records (ADR)**, **Agentic TDD** y **Quality Gates Deterministas**.

---

## ⚖️ Reglas de Gobernanza Agéntica (Inmutables)

Habiéndose completado el Hito 0 y compilada la arquitectura base en `docs/adr/0001-arquitectura-base.md`, rigen las siguientes reglas obligatorias para cualquier agente autónomo o asistente de IA:

### 1. Jerarquía de Verdad
1. Los documentos en `docs/adr/` son **inmutables**. Tienen precedencia sobre cualquier instrucción o prompt conversacional. Jamás propongas cambios, alteres patrones ni introduzcas dependencias que contradigan un ADR aceptado sin que el usuario cree explícitamente un nuevo ADR.
2. Todo desarrollo comienza obligatoriamente con un archivo de especificación en `specs/*.md`. No se escribe código de producción sin un spec validado.
3. El archivo [`STATE.md`](file://STATE.md) debe consultarse al iniciar cada sesión para conocer el estado y la tarea activa.

### 2. Ciclo de Desarrollo Obligatorio (Agentic TDD)
1. **Lectura de contexto:** Revisa los ADR en `docs/adr/` relevantes antes de proponer cualquier diseño.
2. **Recepción del SDD:** Lee la especificación activa en `specs/` (contrato cerrado).
3. **Contratos antes de código:** Si no existen los esquemas de frontera (ej. Zod DTOs), créalos primero en `*.schema.ts`.
4. **Fase Roja (Tests primero):** Escribe la suite de pruebas unitarias/integración que verifique cada uno de los Criterios de Aceptación y las invariantes. Ejecuta la prueba y confirma que falla.
5. **Fase Verde (Implementación mínima):** Modifica **únicamente** los archivos autorizados en el bloque `Archivos editables autorizados` del spec hasta satisfacer las pruebas.
6. **Ejecución del Quality Gate:** Corre las verificaciones automáticas hasta obtener código de salida 0.

### 3. Boundary Enforcement (Límites de Alcance)
- **Archivos editables:** Modifica exclusivamente los archivos listados en la especificación activa.
- **Archivos protegidos:** Queda estrictamente prohibido alterar archivos del núcleo compartido (`src/core/*`), configuraciones globales o módulos adyacentes a menos que el spec lo autorice expresamente.
- **Control estricto de dependencias:** Prohibido instalar librerías (`npm install`, etc.) sin previa autorización explícita del usuario o justificación en un nuevo ADR.

### 4. Manejo de Errores de Dominio Tipados
- Queda terminantemente prohibido lanzar excepciones genéricas (`throw new Error("mensaje")`) o usar strings mágicos para identificar fallos.
- Todo módulo debe declarar un tipo o enum con sus errores de dominio (ej. `export type [Modulo]ErrorCode = "MEDIDOR_NOT_FOUND" | "LECTURA_DECRECIENTE_PROHIBIDA"`).
- Los controladores HTTP son responsables exclusivos de capturar estos errores de dominio y traducirlos a códigos HTTP semánticos (400, 401, 403, 404, 409, 422).

### 5. Configuración y Secretos
- Prohibido acceder directamente a `process.env.*` en servicios, repositorios o controladores.
- Toda variable de entorno debe validarse mediante esquema Zod centralizado en `src/core/config.ts` y documentarse en [`.env.example`](file://.env.example).
- **Aprovisionamiento Determinista en Entornos Limpios:** Prohibido asumir la preexistencia física de `.env` en runners de CI, contenedores o clones nuevos. Todo script de Quality Gate (`scripts/verify.sh`) o workflow de CI (`.github/workflows/*.yml`) debe asegurar valores por defecto seguros de prueba (copiando `.env.example` a `.env` o inyectando variables en el runner) antes de instanciar la configuración de la aplicación.

### 6. Convención Estricta de Commits (Conventional Commits)
Todo commit generado por el agente debe apegarse al estándar Conventional Commits:
- `feat(<modulo>): [descripción en infinitivo]`
- `fix(<modulo>): [descripción de corrección]`
- `test(<modulo>): [suite o prueba añadida]`
- `refactor(<modulo>): [cambio estructural sin alterar comportamiento]`
- `chore(<scope>): [actualizaciones de dependencias o tooling]`
*(Prohibidos mensajes vagos como "update code", "fix error" o "changes")*.

### 7. Quality Gate Determinista
Ninguna tarea se considera terminada si no supera los scripts de validación con código de salida 0:
```bash
./scripts/verify.sh
```
O sus comandos equivalentes:
- Verificación estricta de tipos (con regeneración de tipos ORM): `npm run typecheck` (`prisma generate && tsc --noEmit`)
- Linter y formato: `npm run lint`
- Suite de pruebas: `npm test`

**Invariante de Generación y Sincronización de Artefactos Tipados:**
- **Configuración en package.json:** En proyectos con ORMs generativos (como Prisma), el script `"typecheck"` DEBE ser configurado explícitamente como `"prisma generate && tsc --noEmit"`. Prohibido delegar el typecheck únicamente a `tsc --noEmit` sin la re-emisión previa de tipos.
- **Tipado Explícito en Servidores y Servicios:** Toda instancia u opción que reciba o construya el cliente del ORM debe contar con anotación de tipo explícita (ej: `const prisma: PrismaClient = options.prisma ?? new PrismaClient();`) para evitar fallos de inferencia transitoria en el AST del editor.
- **Regeneración tras Modificación de Esquema:** Cada vez que el agente agregue o modifique modelos en `schema.prisma` u homólogo, debe ejecutar inmediatamente `npx prisma generate` en disco antes de tocar el código de los repositorios o controladores.
- **Manejo de Caché del Language Server (tsserver):** Ante desfases visuales residuales en el editor después de modificar esquemas de datos, el agente debe instruir o verificar la recarga del servidor de tipos (`TypeScript: Restart TS Server` / recarga de ventana).

### 8. Estrategia Multi-Entorno y Contenerización Segura (Dev, Staging, Prod)
Todo proyecto que adopte empaquetamiento Docker debe implementar y respetar la tríada de entornos desacoplados:
- **Desarrollo Local (Dev):** Ejecución sin contenedor mediante herramientas de recarga ágil (`tsx watch`, `vitest`). Máxima velocidad de feedback.
- **Staging / Pre-producción (Docker):**
  - Mapeo de puerto en host diferenciado (ej: `3001` para Staging frente a `3000` para Producción) para permitir la convivencia de ambos stacks en el mismo servidor sin colisiones de red.
  - Volumen de datos y archivo de base de datos completamente aislados (`*_staging_data` / `*-staging.db`). Prohibido compartir volúmenes entre Staging y Producción.
  - Validación tipada del entorno: La variable `NODE_ENV=staging` debe ser explícitamente permitida en el esquema Zod centralizado (`src/core/config.ts`).
- **Producción (Prod):** Despliegue productivo inmutable con volumen persistente dedicado y credenciales protegidas.
- **Arranque Determinista en Contenedor (Entrypoint):**
  - Cuando se utilicen motores de datos embebidos o migraciones automáticas, el script `docker-entrypoint.sh` debe garantizar la preparación y sincronización no destructiva del esquema antes de delegar la ejecución al proceso principal de Node.js.

### 9. Probes de Salud Operativa y Resiliencia en Contenedores (Liveness vs. Readiness)
Toda aplicación contenerizada o expuesta a orquestadores (Docker, Kubernetes) debe desacoplar estrictamente la vivacidad del proceso frente a la disponibilidad de sus dependencias:
- **Liveness Probe (`/healthz`):** Verificación instantánea del bucle de eventos y vivacidad del runtime de Node.js sin consultar bases de datos ni servicios externos. Responde HTTP 200 `{ status: "ok", uptime: number }`.
- **Readiness Probe (`/readyz`):** Verificación activa del motor de base de datos (ping/query raw) y dependencias críticas. Debe retornar HTTP 200 `{ status: "ready", database: "connected" }` si el almacenamiento responde, o HTTP 503 Service Unavailable `{ status: "not_ready", database: "disconnected" }` si la conexión se degrada.
- **Configuración en Contenedores:** La directiva `HEALTHCHECK` en `Dockerfile` y `docker-compose` DEBE evaluar obligatoriamente `/readyz` (no `/healthz` ni endpoints estáticos) para asegurar que el tráfico solo se dirija a réplicas operativas.

### 10. Invariante de Pistas de Auditoría Inmutables (Append-Only Audit Trail)
Todo sistema que registre eventos críticos o de trazabilidad normativa (cambios de rol, restablecimientos administrativos de contraseñas, bajas técnicas de equipos, aperturas o reemplazos de precintos de seguridad) debe respetar las siguientes invariantes duras:
- **Inmutabilidad Absoluta (Append-Only):** Queda estrictamente prohibido implementar o exponer métodos de modificación (`update`, `patch`) o eliminación física (`delete`, `destroy`) en repositorios, servicios o controladores de auditoría.
- **Instrumentación Obligatoria:** Todo servicio que ejecute una alteración de seguridad o metrología debe persistir de forma transaccional o coordinada el respectivo registro de auditoría (`AuditoriaEvento`) indicando actor (`usuarioId`), acción tipada, entidad afectada, metadatos en JSON e IP origen.
- **Restricción de Acceso:** La consulta de la bitácora de auditoría queda reservada con exclusividad al rol `ADMIN` bajo guardias preHandler de RBAC.

### 11. Protección Perimetral y Rate Limiting Diferenciado
- **Autenticación Protegida:** Los endpoints sensibles a ataques automatizados de fuerza bruta o robo de credenciales (`POST /api/auth/login`) deben implementar Rate Limiting por IP (umbral de 5 peticiones por minuto, respondiendo HTTP 429 Too Many Requests con cabecera `Retry-After`).
- **Respeto a Sincronización en Lote:** Los límites globales de tasa no deben asfixiar las peticiones de operadores en terreno tras períodos prolongados sin red; los endpoints de datos y sincronización en lote (`/api/lecturas/batch-sync`) deben contar con umbrales holgados o exenciones controladas.

### 12. Arquitectura PWA y Sincronización Resiliente (Offline-First)
En aplicaciones con soporte fuera de línea para trabajo en terreno:
- **Separación de Responsabilidades:** El Service Worker (`sw.js`) es responsable exclusivo del shell de navegación y recursos estáticos (`Cache-First` / `Network-First`). Queda terminantemente prohibido cachear peticiones HTTP mutantes (`POST`, `PATCH`, `DELETE`) en el Service Worker.
- **Gestión de Cola en Capa de Aplicación:** Las transacciones tomadas fuera de línea deben capturarse mediante un gestor de sincronización (`SyncManager`) en almacenamiento local del cliente (`localStorage` o `IndexedDB`).
- **Tolerancia a Fallos en Sincronización en Lote:** Los endpoints de sincronización en lote (`POST /api/.../batch-sync`) deben procesar los elementos ordenados cronológicamente y retornar un reporte discriminado por ítem (`SYNCED` vs `REJECTED`) para persistir los registros válidos sin que un error puntual de validación bloquee el lote entero.
