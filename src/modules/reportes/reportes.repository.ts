import { PrismaClient } from "@prisma/client";
import {
  IReportesRepository,
  ReporteRawItem,
  FacturaEntity,
} from "./reportes.service.js";
import { FiltroReporteConsumo } from "./reportes.schema.js";

export class PrismaReportesRepository implements IReportesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getReporteRawData(filtro: FiltroReporteConsumo, allowedInstalacionIds?: string[]): Promise<ReporteRawItem[]> {
    const whereMedidor: {
      instalacionId?: string | { in: string[] };
      id?: string;
      tipoMedidor?: { recurso?: string };
      activo?: boolean;
    } = {
      activo: true,
    };

    if (filtro.instalacionId) {
      whereMedidor.instalacionId = filtro.instalacionId;
    } else if (allowedInstalacionIds) {
      whereMedidor.instalacionId = { in: allowedInstalacionIds };
    }
    if (filtro.medidorId) {
      whereMedidor.id = filtro.medidorId;
    }
    if (filtro.recurso) {
      whereMedidor.tipoMedidor = { recurso: filtro.recurso };
    }

    const medidores = await this.prisma.medidor.findMany({
      where: whereMedidor,
      include: {
        instalacion: true,
        tipoMedidor: true,
        lecturas: {
          where: {
            fechaLectura: {
              gte: filtro.fechaInicio,
              lte: filtro.fechaFin,
            },
          },
          orderBy: { fechaLectura: "asc" },
        },
      },
    });

    return medidores.map((m) => ({
      medidorId: m.id,
      medidorCodigo: m.codigo,
      instalacionId: m.instalacionId,
      instalacionNombre: m.instalacion.nombre,
      recurso: m.tipoMedidor.recurso,
      unidad: m.tipoMedidor.unidad,
      tipoMedicion: m.tipoMedidor.tipoMedicion,
      lecturas: m.lecturas.map((l) => ({
        valor: l.valor,
        fechaLectura: l.fechaLectura,
      })),
    }));
  }

  async createFactura(data: Omit<FacturaEntity, "id" | "createdAt" | "updatedAt">): Promise<FacturaEntity> {
    const created = await this.prisma.facturaServicio.create({
      data: {
        instalacionId: data.instalacionId,
        recurso: data.recurso,
        periodoInicio: data.periodoInicio,
        periodoFin: data.periodoFin,
        consumoFacturado: data.consumoFacturado,
        unidad: data.unidad,
        montoTotal: data.montoTotal,
        numeroFactura: data.numeroFactura,
        estadoConciliacion: data.estadoConciliacion,
        consumoMedido: data.consumoMedido,
        diferenciaConsumo: data.diferenciaConsumo,
        porcentajeDesvio: data.porcentajeDesvio,
        notas: data.notas,
      },
    });
    return created as FacturaEntity;
  }

  async listFacturas(instalacionId?: string, allowedInstalacionIds?: string[]): Promise<FacturaEntity[]> {
    let where: { instalacionId?: string | { in: string[] } } | undefined = undefined;
    if (instalacionId) {
      where = { instalacionId };
    } else if (allowedInstalacionIds) {
      where = { instalacionId: { in: allowedInstalacionIds } };
    }
    const facturas = await this.prisma.facturaServicio.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return facturas as FacturaEntity[];
  }
}
