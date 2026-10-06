import { PrismaClient } from "@prisma/client";
import { IDashboardRepository, DashboardRawData } from "./dashboard.service.js";

export class PrismaDashboardRepository implements IDashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getDashboardData(allowedInstalacionIds?: string[]): Promise<DashboardRawData> {
    const whereInst: { activa: boolean; id?: { in: string[] } } = { activa: true };
    if (allowedInstalacionIds !== undefined) {
      whereInst.id = { in: allowedInstalacionIds };
    }

    const instalaciones = await this.prisma.instalacion.findMany({
      where: whereInst,
      select: {
        id: true,
        nombre: true,
        activa: true,
      },
    });

    const whereMed: { instalacionId?: { in: string[] } } = {};
    if (allowedInstalacionIds !== undefined) {
      whereMed.instalacionId = { in: allowedInstalacionIds };
    }

    const medidores = await this.prisma.medidor.findMany({
      where: whereMed,
      include: {
        instalacion: { select: { nombre: true } },
        tipoMedidor: {
          select: {
            recurso: true,
            unidad: true,
            tipoMedicion: true,
          },
        },
      },
    });

    const whereLec: { medidor?: { instalacionId?: { in: string[] } } } = {};
    if (allowedInstalacionIds !== undefined) {
      whereLec.medidor = { instalacionId: { in: allowedInstalacionIds } };
    }

    const lecturas = await this.prisma.lectura.findMany({
      where: whereLec,
      select: {
        id: true,
        medidorId: true,
        valor: true,
        fechaLectura: true,
        operadorId: true,
        notas: true,
      },
    });

    return {
      instalaciones,
      medidores: medidores.map((m) => ({
        id: m.id,
        codigo: m.codigo,
        instalacionId: m.instalacionId,
        instalacionNombre: m.instalacion.nombre,
        ubicacionInterna: m.ubicacionInterna,
        recurso: m.tipoMedidor.recurso,
        unidad: m.tipoMedidor.unidad,
        tipoMedicion: m.tipoMedidor.tipoMedicion,
        activo: m.activo,
      })),
      lecturas,
    };
  }
}
