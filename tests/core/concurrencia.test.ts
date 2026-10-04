import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { configurePrismaSQLite } from "../../src/core/database.js";

describe("Validación de Concurrencia y Resiliencia SQLite WAL (Hito 12)", () => {
  const prisma = new PrismaClient();
  let testInstalacionId: string;
  let testTipoMedidorId: string;
  let testMedidorId: string;
  let testOperadorId: string;

  beforeAll(async () => {
    await configurePrismaSQLite(prisma);

    // Preparar entidades mínimas de prueba
    const inst = await prisma.instalacion.create({
      data: {
        nombre: `Instalacion Concurrencia ${Date.now()}`,
        ubicacion: "Sector Test",
        activa: true,
      },
    });
    testInstalacionId = inst.id;

    const tipo = await prisma.tipoMedidor.create({
      data: {
        nombre: `Tipo Concurrencia ${Date.now()}`,
        recurso: "LUZ",
        unidad: "KWH",
        tipoMedicion: "ACUMULATIVO",
        activo: true,
      },
    });
    testTipoMedidorId = tipo.id;

    const med = await prisma.medidor.create({
      data: {
        instalacionId: testInstalacionId,
        tipoMedidorId: testTipoMedidorId,
        codigo: `MED-CONC-${Date.now()}`,
        ubicacionInterna: "Sala Pruebas",
        activo: true,
      },
    });
    testMedidorId = med.id;

    const op = await prisma.usuario.create({
      data: {
        email: `op-conc-${Date.now()}@medidores.cl`,
        passwordHash: "hash-fake",
        nombre: "Operador Concurrencia",
        rol: "OPERADOR",
        activo: true,
      },
    });
    testOperadorId = op.id;
  });

  afterAll(async () => {
    // Limpieza
    try {
      await prisma.lectura.deleteMany({ where: { medidorId: testMedidorId } });
      await prisma.medidor.delete({ where: { id: testMedidorId } }).catch(() => {});
      await prisma.tipoMedidor.delete({ where: { id: testTipoMedidorId } }).catch(() => {});
      await prisma.instalacion.delete({ where: { id: testInstalacionId } }).catch(() => {});
      await prisma.usuario.delete({ where: { id: testOperadorId } }).catch(() => {});
    } finally {
      await prisma.$disconnect();
    }
  });

  it("debe ejecutar 25 escrituras concurrentes sin arrojar error SQLITE_BUSY gracias a WAL y busy_timeout", async () => {
    const cantidadOperaciones = 25;
    const baseTimestamp = Date.now() - 100000;

    // Crear 25 lecturas simultáneamente con timestamps ligeramente distintos para respetar la unicidad [medidorId, fechaLectura]
    const promesas = Array.from({ length: cantidadOperaciones }, (_, index) => {
      const fecha = new Date(baseTimestamp + index * 1000);
      return prisma.lectura.create({
        data: {
          medidorId: testMedidorId,
          operadorId: testOperadorId,
          valor: 100 + index * 10,
          fechaLectura: fecha,
          notas: `Escritura concurrente ${index}`,
        },
      });
    });

    const resultados = await Promise.allSettled(promesas);

    const fallidas = resultados.filter((r) => r.status === "rejected");
    if (fallidas.length > 0) {
      console.error("Operaciones fallidas en concurrencia:", fallidas);
    }

    expect(fallidas.length).toBe(0);
    expect(resultados.every((r) => r.status === "fulfilled")).toBe(true);

    const totalLecturas = await prisma.lectura.count({
      where: { medidorId: testMedidorId },
    });
    expect(totalLecturas).toBe(cantidadOperaciones);
  });

  it("debe permitir lecturas concurrentes intensivas mientras se realizan escrituras", async () => {
    const lecturasPromesas = Array.from({ length: 30 }, () =>
      prisma.lectura.findMany({
        where: { medidorId: testMedidorId },
        take: 5,
        orderBy: { fechaLectura: "desc" },
      })
    );

    const escrituraPromesa = prisma.medidor.update({
      where: { id: testMedidorId },
      data: { ubicacionInterna: `Actualizado ${Date.now()}` },
    });

    const resultados = await Promise.all([...lecturasPromesas, escrituraPromesa]);
    expect(resultados.length).toBe(31);
  });
});
