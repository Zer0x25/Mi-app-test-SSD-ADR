import { PrismaClient } from "@prisma/client";
import { ILecturasRepository, LecturaEntity } from "./lecturas.service.js";

export class PrismaLecturasRepository implements ILecturasRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByMedidorAndFecha(
    medidorId: string,
    fechaLectura: Date
  ): Promise<LecturaEntity | null> {
    return await this.prisma.lectura.findUnique({
      where: {
        medidorId_fechaLectura: {
          medidorId,
          fechaLectura,
        },
      },
    });
  }

  async findUltimaLectura(medidorId: string): Promise<LecturaEntity | null> {
    return await this.prisma.lectura.findFirst({
      where: { medidorId },
      orderBy: { fechaLectura: "desc" },
    });
  }

  async create(data: Omit<LecturaEntity, "id" | "createdAt">): Promise<LecturaEntity> {
    return (await this.prisma.lectura.create({
      data: {
        medidorId: data.medidorId,
        operadorId: data.operadorId,
        valor: data.valor,
        valorBruto: data.valorBruto ?? null,
        multiplicadorAplicado: data.multiplicadorAplicado ?? null,
        origen: data.origen ?? "MANUAL",
        fechaLectura: data.fechaLectura,
        notas: data.notas,
      },
    })) as unknown as LecturaEntity;
  }

  async listByMedidor(medidorId: string): Promise<LecturaEntity[]> {
    return await this.prisma.lectura.findMany({
      where: { medidorId },
      orderBy: { fechaLectura: "desc" },
    });
  }
}
