import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { PrismaClient } from "@prisma/client";

// Repositorios
import { PrismaInstalacionesRepository } from "./modules/instalaciones/instalaciones.repository.js";
import { PrismaMedidoresRepository } from "./modules/medidores/medidores.repository.js";
import { PrismaLecturasRepository } from "./modules/lecturas/lecturas.repository.js";
import { PrismaDashboardRepository } from "./modules/dashboard/dashboard.repository.js";

// Servicios y Controladores
import { InstalacionesService } from "./modules/instalaciones/instalaciones.service.js";
import { createInstalacionesController } from "./modules/instalaciones/instalaciones.controller.js";
import {
  MedidoresService,
  IInstalacionesVerificationService,
} from "./modules/medidores/medidores.service.js";
import { createMedidoresController } from "./modules/medidores/medidores.controller.js";
import {
  LecturasService,
  IMedidorInfoService,
  IOperadorAccessService,
} from "./modules/lecturas/lecturas.service.js";
import { createLecturasController } from "./modules/lecturas/lecturas.controller.js";
import { DashboardService } from "./modules/dashboard/dashboard.service.js";
import { createDashboardController } from "./modules/dashboard/dashboard.controller.js";

// Errores
import {
  InstalacionNotFoundError,
  InstalacionInactivaError,
} from "./modules/instalaciones/instalaciones.schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface BuildServerOptions {
  prisma?: PrismaClient;
  serveStatic?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
  });

  const prisma = options.prisma ?? new PrismaClient();

  // 1. Plugins de transporte
  await app.register(cors, {
    origin: true,
  });

  if (options.serveStatic !== false) {
    const publicPath = path.join(__dirname, "../public");
    await app.register(fastifyStatic, {
      root: publicPath,
      prefix: "/",
    });
  }

  // 2. Health check y Seed Demo
  app.get("/api/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "Sistema Medidores",
    };
  });

  app.post("/api/demo/seed", async (_req, reply) => {
    try {
      // 1. Instalaciones
      let instNorte = await prisma.instalacion.findUnique({ where: { nombre: "Planta Industrial Norte" } });
      if (!instNorte) {
        instNorte = await prisma.instalacion.create({
          data: { nombre: "Planta Industrial Norte", ubicacion: "Sector Industrial Panamericana Km 15", activa: true },
        });
      }

      let instCorp = await prisma.instalacion.findUnique({ where: { nombre: "Edificio Corporativo" } });
      if (!instCorp) {
        instCorp = await prisma.instalacion.create({
          data: { nombre: "Edificio Corporativo", ubicacion: "Av. Las Condes 12500", activa: true },
        });
      }

      // 2. Operador Demo
      const operadorDemoId = "a0000000-0000-0000-0000-000000000001";
      await prisma.asignacionOperador.upsert({
        where: { instalacionId_usuarioId: { instalacionId: instNorte.id, usuarioId: operadorDemoId } },
        update: {},
        create: { instalacionId: instNorte.id, usuarioId: operadorDemoId },
      });
      await prisma.asignacionOperador.upsert({
        where: { instalacionId_usuarioId: { instalacionId: instCorp.id, usuarioId: operadorDemoId } },
        update: {},
        create: { instalacionId: instCorp.id, usuarioId: operadorDemoId },
      });

      // 3. Tipos de Medidor
      const tiposData = [
        { nombre: "Agua Potable Red", recurso: "AGUA", unidad: "M3", tipoMedicion: "ACUMULATIVO" },
        { nombre: "Electricidad Trifásica", recurso: "LUZ", unidad: "KWH", tipoMedicion: "ACUMULATIVO" },
        { nombre: "Diésel Generador Respaldo", recurso: "PETROLEO", unidad: "LITROS", tipoMedicion: "NIVEL" },
        { nombre: "Gas Natural Calderas", recurso: "GAS", unidad: "M3", tipoMedicion: "ACUMULATIVO" },
      ];

      const tiposMap = new Map<string, string>();
      for (const t of tiposData) {
        let tipo = await prisma.tipoMedidor.findUnique({ where: { nombre: t.nombre } });
        if (!tipo) {
          tipo = await prisma.tipoMedidor.create({ data: { ...t, activo: true } });
        }
        tiposMap.set(t.nombre, tipo.id);
      }

      // 4. Medidores
      const medidoresData = [
        { codigo: "MED-AG-NORTE-01", instalacionId: instNorte.id, tipoMedidorId: tiposMap.get("Agua Potable Red")!, ubicacionInterna: "Sala de bombas - Patio Exterior" },
        { codigo: "MED-LUZ-NORTE-01", instalacionId: instNorte.id, tipoMedidorId: tiposMap.get("Electricidad Trifásica")!, ubicacionInterna: "Subestación Eléctrica 1" },
        { codigo: "MED-DIE-NORTE-01", instalacionId: instNorte.id, tipoMedidorId: tiposMap.get("Diésel Generador Respaldo")!, ubicacionInterna: "Patio de Tanques - Tanque 5.000L" },
        { codigo: "MED-AG-CORP-01", instalacionId: instCorp.id, tipoMedidorId: tiposMap.get("Agua Potable Red")!, ubicacionInterna: "Subterráneo -1 Sala Técnica" },
        { codigo: "MED-GAS-CORP-01", instalacionId: instCorp.id, tipoMedidorId: tiposMap.get("Gas Natural Calderas")!, ubicacionInterna: "Azotea Climatización" },
      ];

      const medidoresMap = new Map<string, string>();
      for (const m of medidoresData) {
        let medidor = await prisma.medidor.findUnique({ where: { codigo: m.codigo } });
        if (!medidor) {
          medidor = await prisma.medidor.create({ data: { ...m, activo: true } });
        }
        medidoresMap.set(m.codigo, medidor.id);
      }

      // 5. Lecturas de prueba
      const ahora = Date.now();
      const medidorAgNorte = medidoresMap.get("MED-AG-NORTE-01")!;
      const countLecturas = await prisma.lectura.count({ where: { medidorId: medidorAgNorte } });

      if (countLecturas === 0) {
        await prisma.lectura.createMany({
          data: [
            { medidorId: medidorAgNorte, operadorId: operadorDemoId, valor: 1200.0, fechaLectura: new Date(ahora - 48 * 3600 * 1000), notas: "Lectura inicial" },
            { medidorId: medidorAgNorte, operadorId: operadorDemoId, valor: 1245.5, fechaLectura: new Date(ahora - 24 * 3600 * 1000), notas: "Cierre día anterior" },
            { medidorId: medidorAgNorte, operadorId: operadorDemoId, valor: 1289.0, fechaLectura: new Date(ahora - 2 * 3600 * 1000), notas: "Turno mañana" },
          ],
        });

        const medidorLuzNorte = medidoresMap.get("MED-LUZ-NORTE-01")!;
        await prisma.lectura.createMany({
          data: [
            { medidorId: medidorLuzNorte, operadorId: operadorDemoId, valor: 45000.0, fechaLectura: new Date(ahora - 24 * 3600 * 1000), notas: "Lectura inicio de semana" },
            { medidorId: medidorLuzNorte, operadorId: operadorDemoId, valor: 45320.0, fechaLectura: new Date(ahora - 1 * 3600 * 1000), notas: "Turno actual" },
          ],
        });

        const medidorDieNorte = medidoresMap.get("MED-DIE-NORTE-01")!;
        await prisma.lectura.createMany({
          data: [
            { medidorId: medidorDieNorte, operadorId: operadorDemoId, valor: 4800.0, fechaLectura: new Date(ahora - 72 * 3600 * 1000), notas: "Llenado de estanque" },
            { medidorId: medidorDieNorte, operadorId: operadorDemoId, valor: 4200.0, fechaLectura: new Date(ahora - 30 * 3600 * 1000), notas: "Consumo prueba de generador" },
          ],
        });
      }

      return reply.status(200).send({
        status: "ok",
        message: "Datos de demostración cargados exitosamente",
        operadorDemoId,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: "SEED_FAILED", message: errorMsg });
    }
  });

  // 3. Adaptadores de verificación entre módulos
  const instalacionesVerifService: IInstalacionesVerificationService = {
    async verifyInstalacionActiva(id: string) {
      const inst = await prisma.instalacion.findUnique({ where: { id } });
      if (!inst) throw new InstalacionNotFoundError(id);
      if (!inst.activa) throw new InstalacionInactivaError(id);
    },
  };

  const medidorInfoService: IMedidorInfoService = {
    async getMedidorInfo(medidorId: string) {
      const medidor = await prisma.medidor.findUnique({
        where: { id: medidorId },
        include: { tipoMedidor: true },
      });
      if (!medidor) return null;
      return {
        id: medidor.id,
        instalacionId: medidor.instalacionId,
        activo: medidor.activo,
        tipoMedicion: medidor.tipoMedidor.tipoMedicion as
          | "ACUMULATIVO"
          | "INSTANTANEO"
          | "NIVEL",
      };
    },
  };

  const operadorAccessService: IOperadorAccessService = {
    async isOperadorAssigned(operadorId: string, instalacionId: string) {
      const asignacion = await prisma.asignacionOperador.findUnique({
        where: {
          instalacionId_usuarioId: {
            instalacionId,
            usuarioId: operadorId,
          },
        },
      });
      return !!asignacion;
    },
  };

  // 4. Instanciación de Repositorios y Servicios
  const instalacionesRepo = new PrismaInstalacionesRepository(prisma);
  const instalacionesService = new InstalacionesService(instalacionesRepo);

  const medidoresRepo = new PrismaMedidoresRepository(prisma);
  const medidoresService = new MedidoresService(medidoresRepo, instalacionesVerifService);

  const lecturasRepo = new PrismaLecturasRepository(prisma);
  const lecturasService = new LecturasService(
    lecturasRepo,
    medidorInfoService,
    operadorAccessService
  );

  const dashboardRepo = new PrismaDashboardRepository(prisma);
  const dashboardService = new DashboardService(dashboardRepo);

  // 5. Registro de Rutas API
  await app.register(createInstalacionesController(instalacionesService), { prefix: "/api" });
  await app.register(createMedidoresController(medidoresService), { prefix: "/api" });
  await app.register(createLecturasController(lecturasService), { prefix: "/api" });
  await app.register(createDashboardController(dashboardService), { prefix: "/api" });

  return app;
}
