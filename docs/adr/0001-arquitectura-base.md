# ADR 0001: Arquitectura Base y Stack Tecnológico del Sistema Medidores

- **Fecha:** 2026-10-03
- **Estado:** Aceptado
- **Afecta a:** Todo el repositorio / Core y Módulos de Negocio

---

## 1. Contexto y Problema
El sistema **Medidores** tiene como objetivo central registrar, gestionar y auditar el consumo y mediciones de diversos recursos físicos e industriales (agua, electricidad, gas, petróleo/combustible, etc.), soportando diferentes tipos y modos de medición (volumétrica en litros o m³, secuencial/acumulativa, instantánea por potencia/flujo, o por niveles porcentuales).

El sistema cuenta con dos perfiles de interacción principales:
1. **Operadores (Data-Entry):** Encargados de ingresar lecturas periódicas o eventos de medición.
2. **Administradores:** Encargados de auditar, configurar medidores, monitorear anomalías y consultar consumos consolidados.

Dada la criticidad del registro de recursos y la intervención de agentes autónomos de IA en el desarrollo, se requiere una arquitectura tipada de extremo a extremo, desacoplada en capas limpias y con barreras inmutables que impidan inconsistencias de datos o regresiones.

---

## 2. Decisión

Se adopta una arquitectura modular limpia guiada por contratos (**Spec-Driven Development**):

1. **Lenguaje y Modo Estricto:**
   - **TypeScript** en modo estricto (`strict: true`, `noImplicitAny: true`, etc.).
   - Prohibido el uso del tipo `any` en cualquier parte de la base de código.

2. **Runtime y Capa de Transporte:**
   - **Node.js** (v20+ LTS).
   - **Fastify** como framework HTTP por su alto rendimiento, bajo overhead y tipado nativo.

3. **Persistencia y ORM:**
   - **SQLite** (`file:./prisma/dev.db`) para desarrollo local ligero y determinista, sin dependencias de servicios externos ni Docker.
   - **Prisma ORM** como interfaz de datos con esquemas tipados y migraciones versionadas, permitiendo una transición transparente a PostgreSQL en caso de escalar a producción.

4. **Validación de Esquemas y Contratos (DTOs):**
   - **Zod** como único motor de validación para entradas HTTP, respuestas seguras y variables de entorno. Quedan vetadas librerías alternas (Joi, Yup).

5. **Suite de Pruebas y Calidad:**
   - **Vitest** como framework de pruebas unitarias y de integración para el ciclo Agentic TDD (fase roja $\rightarrow$ fase verde).
   - Quality Gate determinista ejecutado vía `./scripts/verify.sh` (`typecheck`, `lint`, `test`).

6. **Estructura Modular de Carpetas:**
   ```text
   src/
   ├── core/                  # Utilidades transversales protegidas
   │   ├── config.ts          # Validación de entorno con Zod
   │   └── errors.ts          # Jerarquía base de DomainError
   └── modules/               # Módulos de dominio verticalmente desacoplados
       ├── medidores/         # Gestión de catálogo de medidores
       │   ├── medidores.schema.ts
       │   ├── medidores.service.ts
       │   ├── medidores.controller.ts
       │   └── medidores.repository.ts
       ├── lecturas/          # Registro y auditoría de lecturas
       └── usuarios/          # Autenticación y roles (Operador, Admin)
   tests/
   └── modules/               # Pruebas unitarias/integración espejadas
   ```

---

## 3. Reglas Inmutables para Agentes de IA

### Obligaciones
- **Agentic TDD Estricto:** Nunca implementar código en `src/modules/*` sin haber creado antes la suite de pruebas en `tests/modules/*` y comprobado la fase roja.
- **Pureza de Capas:**
  - El *Controller* solo traduce HTTP $\leftrightarrow$ DTOs y mapea `DomainError` a códigos de estado HTTP semánticos (400, 401, 403, 404, 409, 422).
  - El *Service* contiene 100% de las invariantes y reglas de negocio; no recibe objetos de transporte HTTP (`Request`, `Reply`).
  - El *Repository* se limita a operaciones de persistencia.
- **Invariantes Duras de Dominio:**
  - En medidores acumulativos/secuenciales: **una nueva lectura jamás puede ser menor a la lectura inmediata anterior**.
  - **Inmutabilidad y auditoría:** Prohibido el borrado físico de lecturas históricas (solo soft-delete o rectificación auditada).
  - **Fechas futuras prohibidas:** Ninguna lectura puede registrarse con timestamp posterior al momento actual.
  - **Unicidad:** Prohibido registrar lecturas duplicadas para el mismo medidor en el mismo período/timestamp exacto.
- **Manejo de Errores Tipados:** Todo error de negocio debe heredar de `DomainError` ([errors.ts](file:///home/zer0x/proyectos/Mi-app-test-SSD-ADR/src/core/errors.ts)). Prohibido lanzar `throw new Error("...")`.
- **Quality Gate:** Todo cambio debe superar `./scripts/verify.sh` con código de salida `0`.

### Prohibiciones
- Prohibido el uso de `any` o conversiones no seguras (`as unknown as T` injustificado).
- Prohibido el acceso directo a `process.env.*` fuera de [src/core/config.ts](file:///home/zer0x/proyectos/Mi-app-test-SSD-ADR/src/core/config.ts).
- Prohibido instalar librerías de validación redundantes o herramientas no acordadas.
- Prohibido modificar archivos en `src/core/` o `docs/adr/` durante la implementación de un caso de uso sin un nuevo ADR explícito.

---

## 4. Consecuencias

### Positivas
- **Determinismo Absoluto:** Los agentes de software no pueden degradar la arquitectura gracias a las barreras tipadas y contratos Zod.
- **Cero Fricción Local:** SQLite con Prisma permite clonar y ejecutar tests de inmediato sin configurar contenedores ni bases de datos remotas.
- **Trazabilidad e Integridad:** Los datos de medición quedan blindados contra lecturas regresivas o manipulaciones destructivas.

### Negativas / Trade-offs
- SQLite posee limitaciones de concurrencia de escritura simultánea en escenarios de alta carga distribuida.
- *Mitigación:* La abstracción provista por Prisma y la arquitectura modular permite migrar la cadena de conexión a PostgreSQL mediante configuración sin tocar la lógica de negocio.
