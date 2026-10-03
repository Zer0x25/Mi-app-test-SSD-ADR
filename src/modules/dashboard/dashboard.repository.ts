import { PrismaClient } from "@prisma/client";
import { IDashboardRepository, DashboardRawData } from "./dashboard.service.js";

export class PrismaDashboardRepository implements IDashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getDashboardData(): Promise<DashboardRawData> {
    const instalaciones = await this.prisma.instalacion.findMany({
      select: {
        id: true,
        nombre: true,
        activa: true,
      },
    });

    const medidores = await this.prisma.medidor.findMany({
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

    const lecturas = await this.prisma.lectura.findMany({
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
