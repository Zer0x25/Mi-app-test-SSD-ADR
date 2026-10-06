import { PrismaClient } from "@prisma/client";
import {
  IAlertasRepository,
  ReglaEntity,
  IncidenteEntity,
  MedidorParaEvaluacion,
} from "./alertas.service.js";
import {
  FiltroIncidentes,
  TipoAlerta,
  SeveridadAlerta,
  EstadoIncidente,
} from "./alertas.schema.js";

export class PrismaAlertasRepository implements IAlertasRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getReglasActivas(): Promise<ReglaEntity[]> {
    const list = await this.prisma.reglaAlerta.findMany({
      where: { activa: true },
    });
    return list.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      tipo: r.tipo as TipoAlerta,
      recurso: r.recurso,
      umbralValor: r.umbralValor,
      activa: r.activa,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async getMedidoresParaEvaluacion(): Promise<MedidorParaEvaluacion[]> {
    const list = await this.prisma.medidor.findMany({
      where: { activo: true },
      include: {
        instalacion: true,
        tipoMedidor: true,
        lecturas: {
          orderBy: { fechaLectura: "asc" },
        },
      },
    });

    return list.map((m) => ({
      id: m.id,
      codigo: m.codigo,
      instalacionId: m.instalacionId,
      instalacionNombre: m.instalacion.nombre,
      recurso: m.tipoMedidor.recurso,
      activo: m.activo,
      lecturas: m.lecturas.map((l) => ({
        valor: l.valor,
        fechaLectura: l.fechaLectura,
      })),
    }));
  }

  async findIncidentesAbiertos(): Promise<IncidenteEntity[]> {
    const list = await this.prisma.incidenteAlerta.findMany({
      where: { estado: { not: "RESUELTO" } },
      include: { medidor: true, instalacion: true },
    });

    return list.map((i) => ({
      id: i.id,
      reglaId: i.reglaId,
      medidorId: i.medidorId,
      medidorCodigo: i.medidor.codigo,
      instalacionId: i.instalacionId,
      instalacionNombre: i.instalacion.nombre,
      tipo: i.tipo as TipoAlerta,
      severidad: i.severidad as SeveridadAlerta,
      mensaje: i.mensaje,
      estado: i.estado as EstadoIncidente,
      valorDetectado: i.valorDetectado,
      fechaDeteccion: i.fechaDeteccion,
      fechaResolucion: i.fechaResolucion,
      notasResolucion: i.notasResolucion,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));
  }

  async createIncidente(
    data: Omit<IncidenteEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<IncidenteEntity> {
    const created = await this.prisma.incidenteAlerta.create({
      data: {
        reglaId: data.reglaId,
        medidorId: data.medidorId,
        instalacionId: data.instalacionId,
        tipo: data.tipo,
        severidad: data.severidad,
        mensaje: data.mensaje,
        estado: data.estado,
        valorDetectado: data.valorDetectado,
        fechaDeteccion: data.fechaDeteccion,
      },
      include: { medidor: true, instalacion: true },
    });

    return {
      id: created.id,
      reglaId: created.reglaId,
      medidorId: created.medidorId,
      medidorCodigo: created.medidor.codigo,
      instalacionId: created.instalacionId,
      instalacionNombre: created.instalacion.nombre,
      tipo: created.tipo as TipoAlerta,
      severidad: created.severidad as SeveridadAlerta,
      mensaje: created.mensaje,
      estado: created.estado as EstadoIncidente,
      valorDetectado: created.valorDetectado,
      fechaDeteccion: created.fechaDeteccion,
      fechaResolucion: created.fechaResolucion,
      notasResolucion: created.notasResolucion,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async findIncidenteById(id: string): Promise<IncidenteEntity | null> {
    const inc = await this.prisma.incidenteAlerta.findUnique({
      where: { id },
      include: { medidor: true, instalacion: true },
    });
    if (!inc) return null;
    return {
      id: inc.id,
      reglaId: inc.reglaId,
      medidorId: inc.medidorId,
      medidorCodigo: inc.medidor.codigo,
      instalacionId: inc.instalacionId,
      instalacionNombre: inc.instalacion.nombre,
      tipo: inc.tipo as TipoAlerta,
      severidad: inc.severidad as SeveridadAlerta,
      mensaje: inc.mensaje,
      estado: inc.estado as EstadoIncidente,
      valorDetectado: inc.valorDetectado,
      fechaDeteccion: inc.fechaDeteccion,
      fechaResolucion: inc.fechaResolucion,
      notasResolucion: inc.notasResolucion,
      createdAt: inc.createdAt,
      updatedAt: inc.updatedAt,
    };
  }

  async updateIncidente(
    id: string,
    data: Partial<IncidenteEntity>
  ): Promise<IncidenteEntity> {
    const updated = await this.prisma.incidenteAlerta.update({
      where: { id },
      data: {
        estado: data.estado,
        notasResolucion: data.notasResolucion,
        fechaResolucion: data.fechaResolucion,
      },
      include: { medidor: true, instalacion: true },
    });

    return {
      id: updated.id,
      reglaId: updated.reglaId,
      medidorId: updated.medidorId,
      medidorCodigo: updated.medidor.codigo,
      instalacionId: updated.instalacionId,
      instalacionNombre: updated.instalacion.nombre,
      tipo: updated.tipo as TipoAlerta,
      severidad: updated.severidad as SeveridadAlerta,
      mensaje: updated.mensaje,
      estado: updated.estado as EstadoIncidente,
      valorDetectado: updated.valorDetectado,
      fechaDeteccion: updated.fechaDeteccion,
      fechaResolucion: updated.fechaResolucion,
      notasResolucion: updated.notasResolucion,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async listIncidentes(filtro?: FiltroIncidentes, allowedInstalacionIds?: string[]): Promise<IncidenteEntity[]> {
    const where: {
      instalacionId?: string | { in: string[] };
      estado?: string;
      severidad?: string;
      tipo?: string;
    } = {};

    if (filtro?.instalacionId) {
      where.instalacionId = filtro.instalacionId;
    } else if (allowedInstalacionIds) {
      where.instalacionId = { in: allowedInstalacionIds };
    }
    if (filtro?.estado) where.estado = filtro.estado;
    if (filtro?.severidad) where.severidad = filtro.severidad;
    if (filtro?.tipo) where.tipo = filtro.tipo;

    const list = await this.prisma.incidenteAlerta.findMany({
      where,
      include: { medidor: true, instalacion: true },
      orderBy: { fechaDeteccion: "desc" },
    });

    return list.map((i) => ({
      id: i.id,
      reglaId: i.reglaId,
      medidorId: i.medidorId,
      medidorCodigo: i.medidor.codigo,
      instalacionId: i.instalacionId,
      instalacionNombre: i.instalacion.nombre,
      tipo: i.tipo as TipoAlerta,
      severidad: i.severidad as SeveridadAlerta,
      mensaje: i.mensaje,
      estado: i.estado as EstadoIncidente,
      valorDetectado: i.valorDetectado,
      fechaDeteccion: i.fechaDeteccion,
      fechaResolucion: i.fechaResolucion,
      notasResolucion: i.notasResolucion,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    }));
  }

  async createRegla(
    data: Omit<ReglaEntity, "id" | "createdAt" | "updatedAt">
  ): Promise<ReglaEntity> {
    const created = await this.prisma.reglaAlerta.create({
      data: {
        nombre: data.nombre,
        tipo: data.tipo,
        recurso: data.recurso,
        umbralValor: data.umbralValor,
        activa: data.activa,
      },
    });

    return {
      id: created.id,
      nombre: created.nombre,
      tipo: created.tipo as TipoAlerta,
      recurso: created.recurso,
      umbralValor: created.umbralValor,
      activa: created.activa,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async listReglas(): Promise<ReglaEntity[]> {
    const list = await this.prisma.reglaAlerta.findMany({
      orderBy: { createdAt: "asc" },
    });
    return list.map((r) => ({
      id: r.id,
      nombre: r.nombre,
      tipo: r.tipo as TipoAlerta,
      recurso: r.recurso,
      umbralValor: r.umbralValor,
      activa: r.activa,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }
}
