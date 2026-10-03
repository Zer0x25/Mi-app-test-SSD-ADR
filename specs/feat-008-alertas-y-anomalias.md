# Spec: feat-008 - Sistema de Alertas Automáticas y Detección de Anomalías

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Propósito y Alcance de Negocio

El sistema Medidores requiere un motor de detección temprana de incidentes operativos y anomalías de consumo:
1. **Reglas Configurables:**
   - `SALTO_CONSUMO`: Disparado cuando el consumo entre lecturas consecutivas supera en más de un X% el promedio de consumo histórico del medidor.
   - `FUGA_PROBABLE`: Disparado en medidores de fluidos (ej. AGUA, GAS) cuando se detecta consumo constante persistente sin pausa.
   - `SIN_REPORTE`: Disparado cuando un medidor activo no registra lecturas por más de X horas (por defecto 48 horas).
2. **Ciclo de Vida de Incidentes:**
   - Estados: `ABIERTO` $\rightarrow$ `EN_REVISION` $\rightarrow$ `RESUELTO`.
   - Severidad: `INFO`, `WARNING`, `CRITICAL`.
   - Capacidad del supervisor y administrador de revisar, atender y registrar notas de resolución con timestamp.
3. **Indicadores y Resumen de Estado:**
   - Conteo de incidentes abiertos por nivel de severidad para alimentar badges y banners de advertencia visual en la interfaz.

---

## 2. Archivos Editables Autorizados

- `specs/feat-008-alertas-y-anomalias.md`
- `src/modules/alertas/alertas.schema.ts`
- `src/modules/alertas/alertas.service.ts`
- `src/modules/alertas/alertas.repository.ts`
- `src/modules/alertas/alertas.controller.ts`
- `src/server.ts`
- `tests/modules/alertas/alertas.service.test.ts`
- `tests/modules/alertas/alertas.controller.test.ts`
- `STATE.md`

---

## 3. Contratos de Datos y Esquemas Zod

```typescript
export const TipoAlertaEnum = z.enum(["SALTO_CONSUMO", "FUGA_PROBABLE", "SIN_REPORTE"]);
export const SeveridadAlertaEnum = z.enum(["INFO", "WARNING", "CRITICAL"]);
export const EstadoIncidenteEnum = z.enum(["ABIERTO", "EN_REVISION", "RESUELTO"]);

// Crear o actualizar regla
export const CrearReglaAlertaInputSchema = z.object({
  nombre: z.string().trim().min(3),
  tipo: TipoAlertaEnum,
  recurso: z.enum(["AGUA", "LUZ", "GAS", "PETROLEO"]).optional().nullable(),
  umbralValor: z.number().positive("El umbral debe ser positivo"),
  activa: z.boolean().default(true),
});
export type CrearReglaAlertaInput = z.infer<typeof CrearReglaAlertaInputSchema>;

// Resolver incidente
export const ResolverIncidenteInputSchema = z.object({
  estado: z.enum(["EN_REVISION", "RESUELTO"]),
  notasResolucion: z.string().trim().min(3, "Las notas de resolución deben tener al menos 3 caracteres"),
});
export type ResolverIncidenteInput = z.infer<typeof ResolverIncidenteInputSchema>;

// Filtro de incidentes
export const FiltroIncidentesSchema = z.object({
  instalacionId: z.string().uuid().optional(),
  estado: EstadoIncidenteEnum.optional(),
  severidad: SeveridadAlertaEnum.optional(),
  tipo: TipoAlertaEnum.optional(),
});
export type FiltroIncidentes = z.infer<typeof FiltroIncidentesSchema>;
```

---

## 4. Errores de Dominio Tipados

- `IncidenteNotFoundError` (HTTP 404): Al intentar resolver o consultar un incidente inexistente.
- `ReglaAlertaNotFoundError` (HTTP 404): Al buscar una regla que no existe.
- `IncidenteYaResueltoError` (HTTP 422): Si se intenta alterar un incidente que ya se encuentra cerrado/resuelto.

---

## 5. Criterios de Aceptación y Pruebas Unitarias (Agentic TDD)

### Suite de Servicio (`alertas.service.test.ts`):
1. **Detección de Medidores Sin Reporte > 48h:** Detecta medidores activos cuya última lectura sea más antigua a 48 horas y crea un incidente con severidad `WARNING` (o `CRITICAL` si > 72h).
2. **Detección de Salto Atípico:** Si el último consumo duplica el promedio histórico excediendo el umbral (+50%), genera un incidente `SALTO_CONSUMO`.
3. **Detección de Fuga Probable:** Si hay registros continuos de flujo sin decrecimiento/pausa en medidores de fluidos, levanta alerta `FUGA_PROBABLE`.
4. **No duplicar incidentes abiertos:** Si ya existe un incidente `ABIERTO` del mismo tipo para ese medidor, no debe generar duplicados.
5. **Resolución de incidente:** Al resolver un incidente, cambia el estado a `RESUELTO`, asigna fecha y guarda notas.

### Suite de Controlador (`alertas.controller.test.ts`):
1. `GET /api/alertas/incidentes`: Retorna 200 con la lista de incidentes filtrados.
2. `POST /api/alertas/incidentes/:id/resolver`: Retorna 200 con el incidente actualizado.
3. `POST /api/alertas/evaluar`: Ejecuta la evaluación de reglas y retorna 200 con la cantidad de incidentes detectados.
4. `GET /api/alertas/resumen`: Retorna 200 con métricas de incidentes abiertos, advertencias y críticos.
