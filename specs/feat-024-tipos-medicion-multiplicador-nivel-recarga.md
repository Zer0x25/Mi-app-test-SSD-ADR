# Spec: feat-024-tipos-medicion-multiplicador-nivel-recarga

> **Instrucción para el Agente:** Contrato cerrado bajo SDD + Agentic TDD. No escribir código de producción sin pruebas rojas previas que satisfagan estos criterios. Modificar exclusivamente los archivos autorizados.

---

## 1. Propósito

El catálogo actual (`TipoMedidor { recurso, unidad, tipoMedicion }`) no modela la realidad metrológica:

1. Falta `multiplicador` (factor de transformador de corriente, peso de pulso, escala de sensor). Hoy un trafo 100/5 (×20) debe calcularse a mano.
2. `NIVEL` (estanques) permite bajas pero no valida cota superior, no distingue subida por recarga de error, y reportes/dashboard lo calculan mal (suma niveles o aporta 0).
3. No existe evento de recarga/llenado. Una subida `4200 -> 4800 L` pasa como lectura normal sin trazabilidad.

Objetivo: tipado completo de medición con factor, cota de tanque y recargas auditadas, con fórmulas de consumo correctas por modo.

---

## 2. Archivos editables autorizados

- `specs/feat-024-tipos-medicion-multiplicador-nivel-recarga.md`
- `prisma/schema.prisma`
- `src/modules/medidores/medidores.schema.ts`
- `src/modules/medidores/medidores.service.ts`
- `src/modules/medidores/medidores.repository.ts`
- `src/modules/lecturas/lecturas.schema.ts`
- `src/modules/lecturas/lecturas.service.ts`
- `src/modules/lecturas/lecturas.repository.ts`
- `src/modules/mantenimiento/mantenimiento.schema.ts`
- `src/modules/mantenimiento/mantenimiento.service.ts`
- `src/modules/mantenimiento/mantenimiento.repository.ts`
- `src/modules/reportes/reportes.service.ts`
- `src/modules/reportes/reportes.repository.ts`
- `src/modules/dashboard/dashboard.service.ts`
- `src/modules/dashboard/dashboard.repository.ts`
- `src/modules/alertas/alertas.service.ts`
- `src/modules/alertas/alertas.repository.ts`
- `src/server.ts`
- `public/index.html`
- `public/app.js`
- `tests/modules/medidores/medidores.service.test.ts`
- `tests/modules/lecturas/lecturas.service.test.ts`
- `tests/modules/mantenimiento/mantenimiento.service.test.ts`
- `tests/modules/reportes/reportes.service.test.ts`
- `tests/modules/dashboard/dashboard.service.test.ts`
- `tests/modules/alertas/alertas.service.test.ts`
- `e2e/tipos-medicion.spec.ts`
- `STATE.md`

- **Protegidos:** `src/core/*`, `docs/adr/*` (solo lectura; sin nuevo ADR en este hito).

---

## 3. Modelo de datos y Zod

### 3.1 Prisma

```prisma
model TipoMedidor {
  id              String    @id @default(uuid())
  nombre          String    @unique
  recurso         String
  unidad          String
  tipoMedicion    String    // ACUMULATIVO, INSTANTANEO, NIVEL
  multiplicador   Float     @default(1.0)
  capacidadMaxima Float?
  ...
}
model Lectura {
  ...
  valor             Float   // valor REAL (bruto * multiplicador)
  valorBruto        Float?
  multiplicadorAplicado Float? 
  ...
}
model RegistroMantenimiento {
  ...
  tipo              String  // + RECARGA_TANQUE
  volumenRecargado  Float?
  nivelPosterior    Float?
  ...
}
```

### 3.2 Zod

- `CrearTipoMedidorInputSchema`: `multiplicador: z.number().positive().max(1000000).default(1)`, `capacidadMaxima: z.number().positive().max(100000000).nullable().optional()`. Refinamiento: si `tipoMedicion === "NIVEL"` y `capacidadMaxima` presente debe ser `> 0`; si `NIVEL` sin capacidad se permite (sin cota) pero UI lo sugiere.
- `TipoMedidorResponseSchema`: incluye `multiplicador`, `capacidadMaxima` nullable.
- `RegistrarLecturaInputSchema`: `valor` = lectura del dial (bruto, >= 0). Sin cambios de firma (compatibilidad).
- `LecturaResponseSchema`: añade `valorBruto: number | null`, `multiplicadorAplicado: number | null` (opcionales para compatibilidad con filas legacy).
- `TipoMantenimientoEnum`: añade `"RECARGA_TANQUE"`. `RegistrarMantenimientoInputSchema`: `volumenRecargado: z.number().positive().optional().nullable()`, `nivelPosterior: z.number().nonnegative().optional().nullable()`.
- `MantenimientoResponseSchema`: añade ambos campos nullable.

### 3.3 Errores tipados nuevos

- `NivelFueraDeRangoError`: `code "NIVEL_FUERA_DE_RANGO"`, `422`. Cuando `NIVEL` con `capacidadMaxima` y `valorReal > capacidad`.
- `VolumenRecargaRequeridoError`: `code "VOLUMEN_RECARGA_REQUERIDO"`, `400`. `RECARGA_TANQUE` sin `volumenRecargado > 0`.
- `NivelPosteriorRequeridoError`: `code "NIVEL_POSTERIOR_REQUERIDO"`, `400`. `RECARGA_TANQUE` sin `nivelPosterior >= 0`.
- `RecargaSoloNivelError`: `code "RECARGA_SOLO_NIVEL"`, `422`. `RECARGA_TANQUE` sobre medidor no-`NIVEL`.

Todos heredan `DomainError` con `readonly code` + `readonly statusCode`, `super(message, details)`.

---

## 4. Invariantes de negocio

1. **Multiplicador:** `valorReal = round2(valorBruto * multiplicador)`. Persistir `valor=real`, `valorBruto=bruto`, `multiplicadorAplicado`. Validación decreciente en `ACUMULATIVO` se evalúa sobre `valorReal`. Con `multiplicador=1` el comportamiento legacy se preserva bit a bit.
2. **NIVEL:** permite cualquier `valorReal >= 0`; si `capacidadMaxima` definida y `valorReal > capacidad` rechaza con `NivelFueraDeRangoError`. Las subidas NO se bloquean (la recarga se audita aparte en mantenimiento).
3. **RECARGA_TANQUE:** exige `volumenRecargado > 0` y `nivelPosterior >= 0`; exige medidor `NIVEL`; no altera `activo`; registra auditoría (sin nuevo tipo de auditoría, usa detalles del registro).
4. **Consumo por modo (reportes + dashboard):**
   - `ACUMULATIVO`: `max(0, final - inicial)` (reales).
   - `NIVEL`: `max(0, inicial - final) + Σ recargas en periodo`. Sin recargas equivale a bajada neta.
   - `INSTANTANEO`: `promedio` de lecturas del periodo (round2). `lecturaInicial`=primera, `lecturaFinal`=última.
5. **Alertas:** `SALTO_CONSUMO` y `FUGA_PROBABLE` solo evalúan medidores `ACUMULATIVO` (omitir otros modos para evitar falsos positivos con deltas negativos normales en tanques).
6. **Compatibilidad:** filas legacy con `valorBruto NULL` se tratan como `multiplicador=1` (valor ya es real). Tipos legacy sin `multiplicador` (NULL imposible por default) y sin `capacidad` (NULL = sin cota).

---

## 5. Criterios de aceptación (Agentic TDD)

### Suite 1 — Tipos con factor (medidores.service)
- `crearTipoMedidor` con `multiplicador=20` persiste y retorna `20`; con `NIVEL + capacidadMaxima=5000` persiste; `multiplicador <= 0` rechaza por Zod; `capacidadMaxima <= 0` rechaza por Zod.

### Suite 2 — Lecturas con factor y cota (lecturas.service)
- En `ACUMULATIVO` con `multiplicador=20`: `valor=5` guarda `valor=100, valorBruto=5, multiplicadorAplicado=20`; segunda `valor=6` guarda `120`; `valor=4` (real 80 < 100) rechaza `LecturaDecrecienteError`.
- En `NIVEL` con `capacidad=5000`: `4800` ok, `4200` ok (bajada permitida), `5200` rechaza `NivelFueraDeRangoError`; sin capacidad, cualquier `>= 0` ok.
- Legacy: `valorBruto`/`multiplicadorAplicado` presentes en respuesta (pueden ser null en mocks viejos, pero servicio nuevo siempre los informa).

### Suite 3 — Recargas (mantenimiento.service)
- `RECARGA_TANQUE` en `NIVEL` con `volumen=1000, nivelPosterior=5000` ok; sin `volumen` → `VolumenRecargaRequeridoError`; sin `nivelPosterior` → `NivelPosteriorRequeridoError`; sobre `ACUMULATIVO` → `RecargaSoloNivelError`.

### Suite 4 — Consumos (reportes.service + dashboard.service)
- `ACUMULATIVO` mult=1: `100,200,300` → `200`. Con `mult=20` (reales `2000,4000,6000` si se ingestó con factor) → `4000`.
- `NIVEL`: lecturas `4800 -> 4200` sin recargas → `600`; con recarga `1000` en periodo → `1600`; `4200 -> 4800` sin recarga → `0` (subida sin trazabilidad no genera consumo negativo).
- `INSTANTANEO`: `10,20,30` → `20` (promedio).

### Suite 5 — Alertas
- Con medidor `NIVEL` en baja normal no se genera `SALTO_CONSUMO` ni `FUGA_PROBABLE`; con `ACUMULATIVO` el comportamiento previo se preserva.

### Suite 6 — HTTP/E2E
- `POST /api/tipos-medidor` con `multiplicador` → `201` y eco; `POST /api/lecturas` en tanque sobre capacidad → `422 NIVEL_FUERA_DE_RANGO`; `POST /api/mantenimiento` `RECARGA_TANQUE` válido → `201`, inválido → `400/422` tipado.
- `e2e/tipos-medicion.spec.ts`: crear tipo `NIVEL` con factor+capacidad desde `#/parque`, registrar bajada ok, exceso sobre capacidad rechazado con toast, recarga desde mantenimiento visible en bitácora.

### Quality Gate
- `npm run typecheck`, `npm run lint`, `npm test` y `npx playwright test e2e/tipos-medicion.spec.ts` verdes; `./scripts/verify.sh` salida 0 sin regresiones en suites existentes (mocks actualizados con nuevos campos).
