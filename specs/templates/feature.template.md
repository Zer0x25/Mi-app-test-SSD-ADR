# Spec: [Nombre de la Funcionalidad o Caso de Uso]

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** [Descripción precisa y concisa de lo que se va a implementar]
- **Archivos editables autorizados:**
  - `src/modules/[modulo]/[modulo].schema.ts`
  - `src/modules/[modulo]/[modulo].service.ts`
  - `src/modules/[modulo]/[modulo].controller.ts`
  - `src/modules/[modulo]/[modulo].repository.ts`
  - `tests/modules/[modulo]/[modulo].service.test.ts`
  - `tests/modules/[modulo]/[modulo].controller.test.ts`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/*`
  - `docs/adr/*`
  - Todo archivo fuera de `src/modules/[modulo]/` y `tests/modules/[modulo]/`

---

## 2. Contrato Funcional de Datos (Zod Schemas)

### A. Contrato de Entrada (Input DTO)
```typescript
// Esquema requerido para validar la carga de entrada
// Ej: [Entidad]InputSchema
```
- `campoId`: Formato y tipo (ej. `z.string().uuid()`)
- `campoTexto`: Validaciones (ej. `z.string().trim().min(2).max(100)`)
- `campoEnum`: Valores permitidos (ej. `z.enum(["VALOR_A", "VALOR_B"])`)

### B. Contrato de Salida (Output DTO / Respuestas HTTP)
```typescript
// Esquema de respuesta segura (sin datos sensibles ni hashes)
// Ej: [Entidad]ResponseSchema
```
- Salida esperada (HTTP 200/201):
  - `id`: Identificador único generado.
  - `status`: Estado resultante.
  - `createdAt`: Timestamp en UTC.
  - *(Garantía: ningún campo sensible o privado expuesto).*

---

## 3. Catálogo de Errores de Dominio Tipados
```typescript
// Errores controlados que este módulo puede arrojar
export type [Modulo]ErrorCode =
  | "[MODULO]_NOT_FOUND"
  | "[MODULO]_ALREADY_EXISTS"
  | "INVALID_OPERATION";
```
- Cada error de dominio debe mapearse a un código HTTP semántico en el controlador (400, 401, 403, 404, 409).
- Prohibido lanzar `throw new Error("mensaje")` genéricos sin código de dominio tipado.

---

## 4. Invariantes del Negocio

### A. Invariantes Positivas (Garantías de Comportamiento)
1. **[Garantía 1]:** [Ej. Toda respuesta exitosa debe devolver la entidad completa con timestamp en UTC].
2. **[Garantía 2]:** [Ej. Las transacciones deben asegurar persistencia atómica en todas las tablas afectadas].

### B. Invariantes Negativas (Prohibiciones Duras: Lo que NUNCA debe ocurrir)
1. **[Prohibición 1]:** [Ej. Bajo ninguna circunstancia el saldo de una cuenta puede ser menor a cero; debe rechazar y lanzar error de dominio específico].
2. **[Prohibición 2]:** [Ej. Queda estrictamente prohibido el borrado físico de registros; solo se permiten bajas lógicas con auditoría].
3. **[Prohibición 3]:** [Ej. Jamás persistir o exponer contraseñas o tokens en texto plano].
4. **[Prohibición 4 - Pureza de Capas]:**
   - El controlador jamás debe interactuar con la base de datos directamente ni contener lógica de negocio.
   - El servicio jamás debe recibir ni manipular objetos de transporte HTTP (`Request`, `Response`).
   - El repositorio jamás debe alterar lógica de invariantes; su única función es persistir y consultar.

---

## 5. Criterios de Aceptación (Definition of Done)

- [ ] **Tests de Esquemas de Validación (Zod):**
  - [ ] Rechazo de entradas incompletas o tipos erróneos con mensajes claros.
  - [ ] Normalización correcta de datos de entrada (ej. emails a minúsculas, trims).
- [ ] **Tests de Servicio (Vitest / Framework de pruebas):**
  - [ ] Ejecución exitosa de flujo principal con persistencia simulada por mocks.
  - [ ] Rechazo de operaciones duplicadas o no autorizadas arrojando el error de dominio correspondiente.
  - [ ] Confirmación de que las **Invariantes Negativas** son validadas y rechazan estados inválidos.
- [ ] **Higiene de Commits:**
  - [ ] Todo commit sigue el formato Conventional Commits (`feat([modulo]): ...`, `test([modulo]): ...`).
- [ ] **Quality Gate Determinista (Salida obligatoria: Código 0):**
  - [ ] `npm run typecheck` (sin errores de tipos en modo estricto)
  - [ ] `npm run lint` (sin advertencias ni errores de estilo)
  - [ ] `npm test tests/modules/[modulo]` (100% de tests pasando)
