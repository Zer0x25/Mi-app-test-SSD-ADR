import {
  CrearReglaAlertaInput,
  CrearReglaAlertaInputSchema,
  ResolverIncidenteInput,
  ResolverIncidenteInputSchema,
  FiltroIncidentes,
  IncidenteAlertaResponse,
  ResumenAlertasResponse,
  IncidenteNotFoundError,
  IncidenteYaResueltoError,
  TipoAlerta,
  SeveridadAlerta,
  EstadoIncidente,
} from "./alertas.schema.js";

export interface ReglaEntity {
  id: string;
  nombre: string;
  tipo: TipoAlerta;
  recurso: string | null;
  umbralValor: number;
  activa: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IncidenteEntity {
  id: string;
  reglaId?: string | null;
  medidorId: string;
  medidorCodigo?: string;
  instalacionId: string;
  instalacionNombre?: string;
  tipo: TipoAlerta;
  severidad: SeveridadAlerta;
  mensaje: string;
  estado: EstadoIncidente;
  valorDetectado?: number | null;
  fechaDeteccion: Date;
  fechaResolucion?: Date | null;
  notasResolucion?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MedidorParaEvaluacion {
  id: string;
  codigo: string;
  instalacionId: string;
  instalacionNombre: string;
  recurso: string;
  activo: boolean;
  lecturas: { valor: number; fechaLectura: Date }[];
}

export interface IAlertasRepository {
  getReglasActivas(): Promise<ReglaEntity[]>;
  getMedidoresParaEvaluacion(): Promise<MedidorParaEvaluacion[]>;
  findIncidentesAbiertos(): Promise<IncidenteEntity[]>;
  createIncidente(data: Omit<IncidenteEntity, "id" | "createdAt" | "updatedAt">): Promise<IncidenteEntity>;
  findIncidenteById(id: string): Promise<IncidenteEntity | null>;
  updateIncidente(id: string, data: Partial<IncidenteEntity>): Promise<IncidenteEntity>;
  listIncidentes(filtro?: FiltroIncidentes): Promise<IncidenteEntity[]>;
  createRegla(data: Omit<ReglaEntity, "id" | "createdAt" | "updatedAt">): Promise<ReglaEntity>;
  listReglas(): Promise<ReglaEntity[]>;
}

export class AlertasService {
  constructor(private readonly repository: IAlertasRepository) {}

  async evaluarReglas(ahora: Date = new Date()): Promise<IncidenteAlertaResponse[]> {
    const reglas = await this.repository.getReglasActivas();
    const medidores = await this.repository.getMedidoresParaEvaluacion();
    const incidentesAbiertos = await this.repository.findIncidentesAbiertos();

    const nuevosIncidentes: IncidenteAlertaResponse[] = [];

    // Clave para evitar duplicados: `${medidorId}:${tipo}`
    const abiertosSet = new Set(
      incidentesAbiertos.map((i) => `${i.medidorId}:${i.tipo}`)
    );

    for (const medidor of medidores) {
      if (!medidor.activo) continue;

      const lecturasOrdenadas = [...medidor.lecturas].sort(
        (a, b) => a.fechaLectura.getTime() - b.fechaLectura.getTime()
      );

      for (const regla of reglas) {
        if (regla.recurso && regla.recurso !== medidor.recurso) {
          continue;
        }

        const clave = `${medidor.id}:${regla.tipo}`;
        if (abiertosSet.has(clave)) {
          continue; // Ya existe incidente sin resolver
        }

        // Regla 1: SIN_REPORTE
        if (regla.tipo === "SIN_REPORTE") {
          const ultimaLectura = lecturasOrdenadas[lecturasOrdenadas.length - 1];
          const ultimaFecha = ultimaLectura ? ultimaLectura.fechaLectura : new Date(0);
          const diffHoras = (ahora.getTime() - ultimaFecha.getTime()) / (1000 * 3600);

          if (diffHoras >= regla.umbralValor) {
            const severidad: SeveridadAlerta = diffHoras >= 72 ? "CRITICAL" : "WARNING";
            const created = await this.repository.createIncidente({
              reglaId: regla.id,
              medidorId: medidor.id,
              medidorCodigo: medidor.codigo,
              instalacionId: medidor.instalacionId,
              instalacionNombre: medidor.instalacionNombre,
              tipo: "SIN_REPORTE",
              severidad,
              mensaje: `El medidor «${medidor.codigo}» no ha registrado lecturas en las últimas ${Math.floor(diffHoras)} horas (umbral: ${regla.umbralValor}h).`,
              estado: "ABIERTO",
              valorDetectado: Math.floor(diffHoras),
              fechaDeteccion: ahora,
            });
            abiertosSet.add(clave);
            nuevosIncidentes.push(this.mapIncidenteResponse(created, medidor));
          }
        }

        // Regla 2: SALTO_CONSUMO
        if (regla.tipo === "SALTO_CONSUMO" && lecturasOrdenadas.length >= 3) {
          // Calcular deltas históricos
          const deltas: number[] = [];
          for (let i = 1; i < lecturasOrdenadas.length; i++) {
            deltas.push(lecturasOrdenadas[i].valor - lecturasOrdenadas[i - 1].valor);
          }

          if (deltas.length >= 2) {
            const ultimoDelta = deltas[deltas.length - 1];
            const deltasPrevios = deltas.slice(0, deltas.length - 1);
            const promedioPrevio =
              deltasPrevios.reduce((acc, d) => acc + d, 0) / deltasPrevios.length;

            if (promedioPrevio > 0) {
              const porcentajeAumento = ((ultimoDelta - promedioPrevio) / promedioPrevio) * 100;
              if (porcentajeAumento >= regla.umbralValor) {
                const created = await this.repository.createIncidente({
                  reglaId: regla.id,
                  medidorId: medidor.id,
                  medidorCodigo: medidor.codigo,
                  instalacionId: medidor.instalacionId,
                  instalacionNombre: medidor.instalacionNombre,
                  tipo: "SALTO_CONSUMO",
                  severidad: porcentajeAumento >= 100 ? "CRITICAL" : "WARNING",
                  mensaje: `Salto atípico de consumo detectado en medidor «${medidor.codigo}»: delta actual (${ultimoDelta}) supera en ${porcentajeAumento.toFixed(1)}% el promedio histórico (${promedioPrevio.toFixed(1)}).`,
                  estado: "ABIERTO",
                  valorDetectado: ultimoDelta,
                  fechaDeteccion: ahora,
                });
                abiertosSet.add(clave);
                nuevosIncidentes.push(this.mapIncidenteResponse(created, medidor));
              }
            }
          }
        }

        // Regla 3: FUGA_PROBABLE
        if (regla.tipo === "FUGA_PROBABLE" && lecturasOrdenadas.length >= 3) {
          // Consumo continuo sin pausas
          const ultimasLecturas = lecturasOrdenadas.slice(-Math.max(3, regla.umbralValor));
          let esFuga = true;
          for (let i = 1; i < ultimasLecturas.length; i++) {
            const diff = ultimasLecturas[i].valor - ultimasLecturas[i - 1].valor;
            if (diff <= 0) {
              esFuga = false;
              break;
            }
          }

          if (esFuga) {
            const created = await this.repository.createIncidente({
              reglaId: regla.id,
              medidorId: medidor.id,
              medidorCodigo: medidor.codigo,
              instalacionId: medidor.instalacionId,
              instalacionNombre: medidor.instalacionNombre,
              tipo: "FUGA_PROBABLE",
              severidad: "WARNING",
              mensaje: `Posible fuga continua o flujo ininterrumpido en medidor «${medidor.codigo}» (${medidor.recurso}) sin períodos de reposo.`,
              estado: "ABIERTO",
              valorDetectado: ultimasLecturas[ultimasLecturas.length - 1].valor,
              fechaDeteccion: ahora,
            });
            abiertosSet.add(clave);
            nuevosIncidentes.push(this.mapIncidenteResponse(created, medidor));
          }
        }
      }
    }

    return nuevosIncidentes;
  }

  async resolverIncidente(id: string, rawInput: ResolverIncidenteInput): Promise<IncidenteAlertaResponse> {
    const input = ResolverIncidenteInputSchema.parse(rawInput);
    const incidente = await this.repository.findIncidenteById(id);

    if (!incidente) {
      throw new IncidenteNotFoundError(id);
    }

    if (incidente.estado === "RESUELTO") {
      throw new IncidenteYaResueltoError(id);
    }

    const updated = await this.repository.updateIncidente(id, {
      estado: input.estado,
      notasResolucion: input.notasResolucion,
      fechaResolucion: input.estado === "RESUELTO" ? new Date() : null,
    });

    return this.mapIncidenteResponse(updated);
  }

  async listarIncidentes(filtro?: FiltroIncidentes): Promise<IncidenteAlertaResponse[]> {
    const list = await this.repository.listIncidentes(filtro);
    return list.map((i) => this.mapIncidenteResponse(i));
  }

  async obtenerResumen(instalacionId?: string): Promise<ResumenAlertasResponse> {
    const list = await this.repository.listIncidentes(
      instalacionId ? { instalacionId } : undefined
    );

    const totalAbiertos = list.filter((i) => i.estado === "ABIERTO").length;
    const totalCriticos = list.filter(
      (i) => i.estado === "ABIERTO" && i.severidad === "CRITICAL"
    ).length;
    const totalAdvertencias = list.filter(
      (i) => i.estado === "ABIERTO" && i.severidad === "WARNING"
    ).length;
    const totalEnRevision = list.filter((i) => i.estado === "EN_REVISION").length;
    const totalResueltos = list.filter((i) => i.estado === "RESUELTO").length;

    return {
      totalAbiertos,
      totalCriticos,
      totalAdvertencias,
      totalEnRevision,
      totalResueltos,
    };
  }

  async crearRegla(rawInput: CrearReglaAlertaInput): Promise<ReglaEntity> {
    const input = CrearReglaAlertaInputSchema.parse(rawInput);
    return await this.repository.createRegla({
      nombre: input.nombre,
      tipo: input.tipo,
      recurso: input.recurso ?? null,
      umbralValor: input.umbralValor,
      activa: input.activa,
    });
  }

  async listarReglas(): Promise<ReglaEntity[]> {
    return await this.repository.listReglas();
  }

  private mapIncidenteResponse(
    entity: IncidenteEntity,
    medidor?: MedidorParaEvaluacion
  ): IncidenteAlertaResponse {
    return {
      id: entity.id,
      reglaId: entity.reglaId ?? null,
      medidorId: entity.medidorId,
      medidorCodigo: entity.medidorCodigo ?? medidor?.codigo,
      instalacionId: entity.instalacionId,
      instalacionNombre: entity.instalacionNombre ?? medidor?.instalacionNombre,
      tipo: entity.tipo,
      severidad: entity.severidad,
      mensaje: entity.mensaje,
      estado: entity.estado,
      valorDetectado: entity.valorDetectado ?? null,
      fechaDeteccion: entity.fechaDeteccion,
      fechaResolucion: entity.fechaResolucion ?? null,
      notasResolucion: entity.notasResolucion ?? null,
      createdAt: entity.createdAt,
    };
  }
}
