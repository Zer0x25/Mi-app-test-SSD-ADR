# Spec: feat-007 - Módulo de Reportes, Exportación y Conciliación de Facturas

> **Instrucción para el Agente:** Este documento es un contrato cerrado. No implementes código de producción sin antes escribir las pruebas unitarias que satisfagan estos criterios de aceptación (Agentic TDD).

---

## 1. Propósito y Alcance de Negocio

El sistema Medidores requiere proveer capacidades de auditoría, consolidación y exportación de datos de consumos para administradores y supervisores:
1. **Consumo Neto Consolidado:**
   - Calcular consumos netos agregados por sede (instalación), por medidor y por recurso (AGUA, LUZ, GAS, PETROLEO) dentro de un rango de fechas (`fechaInicio` a `fechaFin`).
   - Para medidores acumulativos: consumo neto = `lectura_final - lectura_inicial_en_rango` (o anterior más cercana).
   - Para medidores de nivel/instantáneos: cálculo de consumo según registros del período.
2. **Descarga Directa en Formato CSV:**
   - Generar formato CSV normalizado con delimitador de comas (`,`), encabezados claros:
     `Sede,Medidor,TipoRecurso,Unidad,LecturaInicial,LecturaFinal,ConsumoNeto,FechaInicio,FechaFin`
   - Servir vía endpoint HTTP con cabecera `Content-Type: text/csv; charset=utf-8` y `Content-Disposition: attachment; filename="reporte-consumo-...csv"`.
3. **Auditoría y Conciliación contra Facturas de Servicios Básicos:**
   - Registro de facturas de empresas distribuidoras (agua, luz, gas) asociadas a una sede y período de facturación.
   - Cálculo automático de desviación:
     `diferencia = consumoFacturado - consumoMedido`
     `porcentajeDesvio = ((consumoFacturado - consumoMedido) / consumoMedido) * 100`
   - Clasificación de estado de conciliación:
     - `CONCILIADO`: desvío absoluto <= 5% (umbral de tolerancia por desfase de ciclo).
     - `DISCREPANCIA`: desvío absoluto > 5%.
     - `PENDIENTE`: sin lecturas suficientes en el período para conciliar.

---

## 2. Archivos Editables Autorizados

- `specs/feat-007-reportes-y-exportacion.md`
- `prisma/schema.prisma`
- `src/modules/reportes/reportes.schema.ts`
- `src/modules/reportes/reportes.service.ts`
- `src/modules/reportes/reportes.repository.ts`
- `src/modules/reportes/reportes.controller.ts`
- `src/server.ts`
- `tests/modules/reportes/reportes.service.test.ts`
- `tests/modules/reportes/reportes.controller.test.ts`
- `STATE.md`

---

## 3. Contratos de Datos y Esquemas Zod

```typescript
// Filtro para consolidación y exportación
export const FiltroReporteConsumoSchema = z.object({
  instalacionId: z.string().uuid().optional(),
  medidorId: z.string().uuid().optional(),
  recurso: z.enum(["AGUA", "LUZ", "GAS", "PETROLEO", "OTRO"]).optional(),
  fechaInicio: z.coerce.date(),
  fechaFin: z.coerce.date(),
}).refine((data) => data.fechaInicio <= data.fechaFin, {
  message: "La fechaInicio no puede ser posterior a fechaFin",
  path: ["fechaInicio"],
});
export type FiltroReporteConsumo = z.infer<typeof FiltroReporteConsumoSchema>;

// Fila de consumo consolidado
export const ItemConsumoConsolidadoSchema = z.object({
  medidorId: z.string().uuid(),
  medidorCodigo: z.string(),
  instalacionId: z.string().uuid(),
  instalacionNombre: z.string(),
  recurso: z.string(),
  unidad: z.string(),
  lecturaInicial: z.number(),
  lecturaFinal: z.number(),
  consumoNeto: z.number(),
  totalLecturas: z.number(),
  fechaInicio: z.date(),
  fechaFin: z.date(),
});
export type ItemConsumoConsolidado = z.infer<typeof ItemConsumoConsolidadoSchema>;

// Registro de factura para conciliación
export const RegistrarFacturaInputSchema = z.object({
  instalacionId: z.string().uuid(),
  recurso: z.enum(["AGUA", "LUZ", "GAS", "PETROLEO", "OTRO"]),
  numeroFactura: z.string().trim().min(1).optional(),
  periodoInicio: z.coerce.date(),
  periodoFin: z.coerce.date(),
  consumoFacturado: z.number().positive("El consumo facturado debe ser mayor a 0"),
  unidad: z.string().trim().min(1),
  montoTotal: z.number().nonnegative().optional(),
  notas: z.string().trim().max(500).optional(),
}).refine((data) => data.periodoInicio < data.periodoFin, {
  message: "El periodoInicio debe ser anterior a periodoFin",
  path: ["periodoInicio"],
});
export type RegistrarFacturaInput = z.infer<typeof RegistrarFacturaInputSchema>;

// Resultado de conciliación de factura
export const FacturaConciliadaResponseSchema = z.object({
  id: z.string().uuid(),
  instalacionId: z.string().uuid(),
  recurso: z.string(),
  numeroFactura: z.string().nullable(),
  periodoInicio: z.date(),
  periodoFin: z.date(),
  consumoFacturado: z.number(),
  consumoMedido: z.number().nullable(),
  diferenciaConsumo: z.number().nullable(),
  porcentajeDesvio: z.number().nullable(),
  estadoConciliacion: z.enum(["PENDIENTE", "CONCILIADO", "DISCREPANCIA"]),
  unidad: z.string(),
  montoTotal: z.number().nullable(),
  notas: z.string().nullable(),
  createdAt: z.date(),
});
export type FacturaConciliadaResponse = z.infer<typeof FacturaConciliadaResponseSchema>;
```

---

## 4. Errores de Dominio Tipados

- `RangoFechasInvalidoError` (HTTP 400): Cuando fechaInicio > fechaFin.
- `InstalacionReporteNotFoundError` (HTTP 404): Si se especifica una instalación inexistente.
- `FacturaNotFoundError` (HTTP 404): Al buscar una factura que no existe.

---

## 5. Criterios de Aceptación y Pruebas Unitarias (Agentic TDD)

### Suite de Servicio (`reportes.service.test.ts`):
1. **Cálculo de Consumo Neto Acumulativo:** Para medidores acumulativos, resta la lectura inicial más temprana dentro/cercana del período de la lectura final más tardía.
2. **Generación de CSV:** Genera una cadena de texto en formato CSV con delimitador por comas y cabeceras exactas.
3. **Conciliación Exitosa (Tolerancia <= 5%):** Registra factura, calcula consumo interno en las fechas de la factura, desvío <= 5% asigna estado `CONCILIADO`.
4. **Discrepancia Detectada (> 5%):** Si la factura difiere en más del 5% del consumo medido, asigna estado `DISCREPANCIA`.
5. **Conciliación Pendiente (Sin lecturas):** Si no hay lecturas registradas para ese recurso en ese período, asigna estado `PENDIENTE`.

### Suite de Controlador (`reportes.controller.test.ts`):
1. `GET /api/reportes/consumos`: Retorna 200 con el array JSON de consumos consolidados.
2. `GET /api/reportes/consumos/exportar-csv`: Retorna 200 con encabezado `content-type: text/csv` y contenido de texto plano CSV.
3. `POST /api/reportes/facturas`: Retorna 201 Created con la factura registrada y conciliada.
4. `GET /api/reportes/facturas`: Retorna 200 con la lista de facturas y su estado de conciliación.
