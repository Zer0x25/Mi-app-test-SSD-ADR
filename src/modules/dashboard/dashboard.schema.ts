import { z } from "zod";

// ==============================================================================
// DTOs para Dashboard de Administración
// ==============================================================================

export const DashboardKpisResponseSchema = z.object({
  totalInstalaciones: z.number().int().nonnegative(),
  totalMedidores: z.number().int().nonnegative(),
  medidoresPorRecurso: z.record(z.string(), z.number().int().nonnegative()),
  totalLecturas: z.number().int().nonnegative(),
});

export type DashboardKpisResponse = z.infer<typeof DashboardKpisResponseSchema>;

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

export const ConsumoPorInstalacionSchema = z.object({
  instalacionId: z.string().uuid(),
  instalacionNombre: z.string(),
  recurso: z.string(),
  unidad: z.string(),
  consumoNeto: z.number(),
  cantidadMedidores: z.number().int().nonnegative(),
});

export type ConsumoPorInstalacion = z.infer<typeof ConsumoPorInstalacionSchema>;

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
