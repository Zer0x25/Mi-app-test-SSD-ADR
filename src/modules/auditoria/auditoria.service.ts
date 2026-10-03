import {
  RegistrarAuditoriaInput,
  RegistrarAuditoriaInputSchema,
  FiltroAuditoria,
  FiltroAuditoriaSchema,
  AuditoriaEventoResponse,
  AuditoriaEventoResponseSchema,
} from "./auditoria.schema.js";

export interface AuditoriaEntity {
  id: string;
  usuarioId: string | null;
  accion: string;
  entidad: string;
  entidadId: string;
  detalles: string | null;
  ip: string | null;
  createdAt: Date;
}

export interface IAuditoriaRepository {
  create(data: Omit<AuditoriaEntity, "id" | "createdAt">): Promise<AuditoriaEntity>;
  list(filtro?: FiltroAuditoria): Promise<AuditoriaEntity[]>;
}

export class AuditoriaService {
  constructor(private readonly repository: IAuditoriaRepository) {}

  /**
   * Registra un nuevo evento de auditoría inmutable (append-only).
   * Prohibido cualquier tipo de modificación posterior.
   */
  async registrarEvento(rawInput: RegistrarAuditoriaInput): Promise<AuditoriaEventoResponse> {
    const input = RegistrarAuditoriaInputSchema.parse(rawInput);

    const detallesString = input.detalles ? JSON.stringify(input.detalles) : null;

    const entidad = await this.repository.create({
      usuarioId: input.usuarioId ?? null,
      accion: input.accion,
      entidad: input.entidad,
      entidadId: input.entidadId,
      detalles: detallesString,
      ip: input.ip ?? null,
    });

    return this.mapEntityToResponse(entidad);
  }

  /**
   * Consulta el historial de eventos aplicando filtros por acción, entidad, usuario o rango de fechas.
   */
  async listarEventos(rawFiltro?: FiltroAuditoria): Promise<AuditoriaEventoResponse[]> {
    const filtro = rawFiltro ? FiltroAuditoriaSchema.parse(rawFiltro) : undefined;
    const lista = await this.repository.list(filtro);
    return lista.map((e) => this.mapEntityToResponse(e));
  }

  private mapEntityToResponse(entity: AuditoriaEntity): AuditoriaEventoResponse {
    let parsedDetalles: Record<string, unknown> | null = null;
    if (entity.detalles) {
      try {
        parsedDetalles = JSON.parse(entity.detalles);
      } catch {
        parsedDetalles = { raw: entity.detalles };
      }
    }

    return AuditoriaEventoResponseSchema.parse({
      id: entity.id,
      usuarioId: entity.usuarioId,
      accion: entity.accion,
      entidad: entity.entidad,
      entidadId: entity.entidadId,
      detalles: parsedDetalles,
      ip: entity.ip,
      createdAt: entity.createdAt,
    });
  }
}
