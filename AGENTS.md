# Protocolo Operativo para Agentes de Software (AGENTS.md)

Este repositorio opera bajo la metodología **Spec-Driven Development (SDD)**, **Architecture Decision Records (ADR)**, **Agentic TDD** y **Quality Gates Deterministas**.

---

## 📌 Estado Inicial: Semilla Agnóstica (Hito 0)

> [!IMPORTANT]
> Si en [`STATE.md`](file://STATE.md) la fase actual es **Hito 0** (o aún no existe `docs/adr/0001-arquitectura-base.md`):
> Cuando el usuario indique **"Inicia Hito 0"**, **"Inicia la entrevista"** o solicite comenzar un nuevo proyecto, debes **leer y ejecutar inmediatamente las instrucciones de [.agents/bootstrap.md](file://.agents/bootstrap.md)**.
> Al finalizar la compilación del Hito 0, ejecuta el **Auto-Sellado**: retira este bloque de inicialización, archiva `bootstrap.md` y actualiza `STATE.md` para liberar contexto y enfocar el 100% de la atención en el proyecto real.

---

## ⚖️ Reglas de Gobernanza Agéntica (Inmutables)

Una vez completado el Hito 0 y compilada la arquitectura base, rigen las siguientes reglas obligatorias para cualquier agente autónomo o asistente de IA:

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
- Todo módulo debe declarar un tipo o enum con sus errores de dominio (ej. `export type [Modulo]ErrorCode = "USER_NOT_FOUND" | "INSUFFICIENT_FUNDS"`).
- Los controladores HTTP son responsables exclusivos de capturar estos errores de dominio y traducirlos a códigos HTTP semánticos (400, 401, 403, 404, 409, 422).

### 5. Configuración y Secretos
- Prohibido acceder directamente a `process.env.*` en servicios, repositorios o controladores.
- Toda variable de entorno debe validarse mediante esquema Zod centralizado en `src/core/config.ts` y documentarse en [`.env.example`](file://.env.example).

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
- Verificación estricta de tipos: `npm run typecheck`
- Linter y formato: `npm run lint`
- Suite de pruebas: `npm test`
