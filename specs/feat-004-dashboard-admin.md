# Spec: feat-004-dashboard-admin

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Alcance y Límites de Archivos

- **Objetivo:** Implementar el módulo de reportería y métricas para Administradores (KPIs globales del parque de medidores, alertas de medidores desatendidos sin lectura en las últimas 24h, cálculo de consumo neto por instalación/recurso y feed de actividad reciente).
- **Archivos editables autorizados:**
  - `src/modules/dashboard/dashboard.schema.ts`
  - `src/modules/dashboard/dashboard.service.ts`
  - `src/modules/dashboard/dashboard.repository.ts`
  - `src/modules/dashboard/dashboard.controller.ts`
  - `tests/modules/dashboard/dashboard.service.test.ts`
  - `tests/modules/dashboard/dashboard.controller.test.ts`
  - `STATE.md`
- **Archivos protegidos (solo lectura / prohibido modificar):**
  - `src/core/*`
  - `docs/adr/*`
  - Todo archivo fuera de `src/modules/dashboard/` y `tests/modules/dashboard/`

---

## 2. Contrato Funcional de Datos (Zod Schemas)

### A. KPIs Globales (Output DTO)
```typescript
export const DashboardKpisResponseSchema = z.object({
  totalInstalaciones: z.number().int().nonnegative(),
  totalMedidores: z.number().int().nonnegative(),
  medidoresPorRecurso: z.record(z.string(), z.number().int().nonnegative()),
  totalLecturas: z.number().int().nonnegative(),
});

export type DashboardKpisResponse = z.infer<typeof DashboardKpisResponseSchema>;
```

### B. Medidores Desatendidos (Output DTO)
```typescript
export const MedidorDesatendidoSchema = z.object({
  medidorId: z.string().uuid(),
  codigo: z.string(),
  instalacionId: z.string().uuid(),
  instalacionNombre: z.string(),
  ubicacionInterna: z.string(),
  ultimaLecturaFecha: z.date().nullable(),
  horasSinLectura: z.number().nullable(),
});

export type MedidorDesatendido = z.infer<typeof MedidorDesatendidoSchema>;
```

### C. Consumo Neto por Instalación y Recurso (Output DTO)
```typescript
export const ConsumoPorInstalacionSchema = z.object({
  instalacionId: z.string().uuid(),
  instalacionNombre: z.string(),
  recurso: z.string(),
  unidad: z.string(),
  consumoNeto: z.number(),
  cantidadMedidores: z.number().int().nonnegative(),
});

export type ConsumoPorInstalacion = z.infer<typeof ConsumoPorInstalacionSchema>;
```

### D. Feed de Actividad Reciente (Output DTO)
```typescript
export const ActividadRecienteLecturaSchema = z.object({
  id: z.string().uuid(),
  medidorId: z.string().uuid(),
  medidorCodigo: z.string(),
  instalacionNombre: z.string(),
  recurso: z.string(),
  unidad: z.string(),
  valor: z.number(),
  fechaLectura: z.date(),
  operadorId: z.string().uuid(),
  notas: z.string().nullable().optional(),
});

export type ActividadRecienteLectura = z.infer<typeof ActividadRecienteLecturaSchema>;
```

---

## 3. Invariantes del Negocio

### A. Invariantes Positivas (Garantías de Comportamiento)
1. **Consistencia de Conteo:** Los KPIs solo contabilizan entidades activas (`activa: true` / `activo: true`).
2. **Cálculo de Consumo Neto:** Para medidores acumulativos, el consumo neto se calcula como `(lecturaMáxima - lecturaMínima)` dentro del conjunto de lecturas registradas.
3. **Cálculo de Alertas:** Un medidor se considera desatendido si su última lectura fue registrada hace más de $N$ horas (por defecto 24 horas), o si nunca ha tenido lecturas registradas desde su creación.
4. **Orden del Feed:** Las actividades recientes se devuelven ordenadas cronológicamente de forma estrictamente descendente.

### B. Invariantes Negativas (Prohibiciones Duras: Lo que NUNCA debe ocurrir)
1. **No Modificaciones:** El módulo de dashboard es de solo lectura y auditoría; tiene terminantemente prohibido alterar, mutar o eliminar registros.
2. **Pureza de Capas:** El controlador maneja HTTP, el servicio la orquestación y agregación de métricas, y el repositorio la ejecución de consultas optimizadas.

---

## 4. Criterios de Aceptación (Definition of Done)

- [x] **Tests de Esquemas de Validación (Zod):**
  - [x] Validación de estructuras de KPIs y feeds.
- [x] **Tests de Servicio (Vitest / Agentic TDD):**
  - [x] `obtenerKpis`: calcula correctamente totales e histograma de medidores por recurso.
  - [x] `obtenerMedidoresDesatendidos`: identifica medidores sin lectura reciente (> 24h) o sin ninguna lectura.
  - [x] `obtenerConsumoPorInstalacion`: calcula la diferencia neta `(max - min)` en acumulativos.
  - [x] `obtenerActividadReciente`: lista las últimas lecturas con sus datos asociados.
- [x] **Tests de Controlador HTTP (Fastify):**
  - [x] `GET /api/dashboard/kpis` -> 200 OK.
  - [x] `GET /api/dashboard/desatendidos` -> 200 OK.
  - [x] `GET /api/dashboard/consumos` -> 200 OK.
  - [x] `GET /api/dashboard/actividad-reciente` -> 200 OK.
- [x] **Quality Gate Determinista (Salida obligatoria: Código 0):**
  - [x] `./scripts/verify.sh` superado al 100%.
