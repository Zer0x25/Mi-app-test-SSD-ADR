import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { FastifyInstance, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { PrismaClient } from "@prisma/client";
import { config } from "./core/config.js";

// Repositorios
import { PrismaInstalacionesRepository } from "./modules/instalaciones/instalaciones.repository.js";
import { PrismaMedidoresRepository } from "./modules/medidores/medidores.repository.js";
import { PrismaLecturasRepository } from "./modules/lecturas/lecturas.repository.js";
import { PrismaDashboardRepository } from "./modules/dashboard/dashboard.repository.js";
import { PrismaUsuariosRepository } from "./modules/usuarios/usuarios.repository.js";
import { PrismaReportesRepository } from "./modules/reportes/reportes.repository.js";
import { PrismaAlertasRepository } from "./modules/alertas/alertas.repository.js";

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
import { UsuariosService } from "./modules/usuarios/usuarios.service.js";
import { createUsuariosController } from "./modules/usuarios/usuarios.controller.js";
import { ReportesService } from "./modules/reportes/reportes.service.js";
import { createReportesController } from "./modules/reportes/reportes.controller.js";
import { AlertasService } from "./modules/alertas/alertas.service.js";
import { createAlertasController } from "./modules/alertas/alertas.controller.js";
import { PrismaMantenimientoRepository } from "./modules/mantenimiento/mantenimiento.repository.js";
import { MantenimientoService } from "./modules/mantenimiento/mantenimiento.service.js";
import { createMantenimientoController } from "./modules/mantenimiento/mantenimiento.controller.js";
import { hashPassword } from "./modules/usuarios/auth.utils.js";

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

  // Permitir cuerpos vacíos cuando Content-Type es application/json
  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_req, body: string, done) => {
      if (!body || body.trim() === "") {
        return done(null, {});
      }
      try {
        const json = JSON.parse(body);
        done(null, json);
      } catch (err: unknown) {
        done(err as Error, undefined);
      }
    }
  );

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

  // 2. Instanciación de Repositorios y Servicios
  const usuariosRepo = new PrismaUsuariosRepository(prisma);
  const usuariosService = new UsuariosService(usuariosRepo, config.JWT_SECRET);

  // Hook de autenticación y RBAC transversal
  app.addHook("preHandler", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const token = authHeader.slice(7).trim();
        const payload = usuariosService.verificarToken(token);
        (request as unknown as { user?: typeof payload }).user = payload;
      } catch {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Token de autenticación inválido o expirado.",
        });
      }
    }

    const user = (request as unknown as { user?: { rol: string; userId: string } }).user;

    // Regla RBAC 1: Crear Instalación solo permitido para ADMIN
    if (request.method === "POST" && request.url.startsWith("/api/instalaciones")) {
      if (user) {
        if (user.rol !== "ADMIN") {
          return reply.status(403).send({
            error: "ACCESO_DENEGADO",
            message: `Acceso denegado: el rol «${user.rol}» no tiene permisos para crear instalaciones.`,
          });
        }
      }
    }

    // Regla RBAC 2: Crear Medidores
    // - ADMIN: permitido en cualquier sede
    // - SUPERVISOR: permitido solo si tiene la instalación asignada
    // - OPERADOR: denegado
    if (request.method === "POST" && request.url.startsWith("/api/medidores")) {
      if (user) {
        const body = request.body as { instalacionId?: string } | undefined;
        if (user.rol === "OPERADOR") {
          return reply.status(403).send({
            error: "ACCESO_DENEGADO",
            message: "Acceso denegado: el rol «OPERADOR» no cuenta con permisos para crear medidores.",
          });
        }
        if (user.rol === "SUPERVISOR" && body?.instalacionId) {
          const asignado = await usuariosRepo.isUsuarioAssignedToInstalacion(
            user.userId,
            body.instalacionId
          );
          if (!asignado) {
            return reply.status(403).send({
              error: "INSTALACION_NO_ASIGNADA",
              message: `Operación denegada: el supervisor no tiene asignada la instalación «${body.instalacionId}».`,
            });
          }
        }
      }
    }

    // Regla RBAC 3: Gestión de Usuarios solo permitido para ADMIN
    if (request.url.startsWith("/api/usuarios")) {
      if (!user) {
        return reply.status(401).send({
          error: "UNAUTHORIZED",
          message: "Cabecera Authorization con formato Bearer <token> requerida.",
        });
      }
      if (user.rol !== "ADMIN") {
        return reply.status(403).send({
          error: "ACCESO_DENEGADO",
          message: `Acceso denegado: el rol «${user.rol}» no tiene permisos para gestionar usuarios.`,
        });
      }
    }
  });

  // 3. Health check y Seed Demo
  app.get("/api/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "Sistema Medidores",
    };
  });

  app.post("/api/demo/seed", async (_req, reply) => {
    try {
      // 1. Usuarios Demo con los 3 Roles: ADMIN, SUPERVISOR, OPERADOR
      const defaultPasswordHash = await hashPassword("demo1234");

      await prisma.usuario.upsert({
        where: { email: "admin@medidores.cl" },
        update: { passwordHash: defaultPasswordHash, rol: "ADMIN", activo: true },
        create: {
          email: "admin@medidores.cl",
          passwordHash: defaultPasswordHash,
          nombre: "Administrador Central",
          rol: "ADMIN",
          activo: true,
        },
      });

      const supervisorUser = await prisma.usuario.upsert({
        where: { email: "supervisor@medidores.cl" },
        update: { passwordHash: defaultPasswordHash, rol: "SUPERVISOR", activo: true },
        create: {
          email: "supervisor@medidores.cl",
          passwordHash: defaultPasswordHash,
          nombre: "Carlos Supervisor (Planta Norte)",
          rol: "SUPERVISOR",
          activo: true,
        },
      });

      const operadorUser = await prisma.usuario.upsert({
        where: { email: "operador@medidores.cl" },
        update: { passwordHash: defaultPasswordHash, rol: "OPERADOR", activo: true },
        create: {
          email: "operador@medidores.cl",
          passwordHash: defaultPasswordHash,
          nombre: "Juan Operador Terreno",
          rol: "OPERADOR",
          activo: true,
        },
      });

      // 2. Instalaciones
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

      // 3. Asignaciones de Roles a Instalaciones
      // Supervisor asignado únicamente a Planta Norte
      await prisma.asignacionOperador.upsert({
        where: { instalacionId_usuarioId: { instalacionId: instNorte.id, usuarioId: supervisorUser.id } },
        update: {},
        create: { instalacionId: instNorte.id, usuarioId: supervisorUser.id },
      });

      // Operador asignado a Planta Norte y Edificio Corporativo
      await prisma.asignacionOperador.upsert({
        where: { instalacionId_usuarioId: { instalacionId: instNorte.id, usuarioId: operadorUser.id } },
        update: {},
        create: { instalacionId: instNorte.id, usuarioId: operadorUser.id },
      });
      await prisma.asignacionOperador.upsert({
        where: { instalacionId_usuarioId: { instalacionId: instCorp.id, usuarioId: operadorUser.id } },
        update: {},
        create: { instalacionId: instCorp.id, usuarioId: operadorUser.id },
      });

      // 4. Tipos de Medidor
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

      // 5. Medidores Físicos
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

      // 6. Lecturas de prueba
      const ahora = Date.now();
      const medidorAgNorte = medidoresMap.get("MED-AG-NORTE-01")!;
      const countLecturas = await prisma.lectura.count({ where: { medidorId: medidorAgNorte } });

      if (countLecturas === 0) {
        await prisma.lectura.createMany({
          data: [
            { medidorId: medidorAgNorte, operadorId: operadorUser.id, valor: 1200.0, fechaLectura: new Date(ahora - 48 * 3600 * 1000), notas: "Lectura inicial" },
            { medidorId: medidorAgNorte, operadorId: operadorUser.id, valor: 1245.5, fechaLectura: new Date(ahora - 24 * 3600 * 1000), notas: "Cierre día anterior" },
            { medidorId: medidorAgNorte, operadorId: operadorUser.id, valor: 1289.0, fechaLectura: new Date(ahora - 2 * 3600 * 1000), notas: "Turno mañana" },
          ],
        });

        const medidorLuzNorte = medidoresMap.get("MED-LUZ-NORTE-01")!;
        await prisma.lectura.createMany({
          data: [
            { medidorId: medidorLuzNorte, operadorId: operadorUser.id, valor: 45000.0, fechaLectura: new Date(ahora - 24 * 3600 * 1000), notas: "Lectura inicio de semana" },
            { medidorId: medidorLuzNorte, operadorId: operadorUser.id, valor: 45320.0, fechaLectura: new Date(ahora - 1 * 3600 * 1000), notas: "Turno actual" },
          ],
        });

        const medidorDieNorte = medidoresMap.get("MED-DIE-NORTE-01")!;
        await prisma.lectura.createMany({
          data: [
            { medidorId: medidorDieNorte, operadorId: operadorUser.id, valor: 4800.0, fechaLectura: new Date(ahora - 72 * 3600 * 1000), notas: "Llenado de estanque" },
            { medidorId: medidorDieNorte, operadorId: operadorUser.id, valor: 4200.0, fechaLectura: new Date(ahora - 30 * 3600 * 1000), notas: "Consumo prueba de generador" },
          ],
        });
      }

      // 7. Reglas de alertas iniciales
      const countReglas = await prisma.reglaAlerta.count();
      if (countReglas === 0) {
        await prisma.reglaAlerta.createMany({
          data: [
            { nombre: "Alerta por Medidor sin Reporte > 48 horas", tipo: "SIN_REPORTE", umbralValor: 48, activa: true },
            { nombre: "Detección de Salto Atípico de Consumo (+50%)", tipo: "SALTO_CONSUMO", umbralValor: 50, activa: true },
            { nombre: "Detección de Fuga Continua en Agua", tipo: "FUGA_PROBABLE", recurso: "AGUA", umbralValor: 3, activa: true },
          ],
        });
      }

      // 8. Registro de mantenimiento inicial de prueba
      const countMantenimientos = await prisma.registroMantenimiento.count();
      if (countMantenimientos === 0) {
        const medidorAgNorteId = medidoresMap.get("MED-AG-NORTE-01");
        if (medidorAgNorteId) {
          await prisma.registroMantenimiento.create({
            data: {
              medidorId: medidorAgNorteId,
              tipo: "CALIBRACION",
              fechaMantenimiento: new Date(ahora - 90 * 24 * 3600 * 1000),
              proximaCalibracion: new Date(ahora + 275 * 24 * 3600 * 1000),
              tecnicoResponsable: "Ing. Rodrigo Silva (Dictuc)",
              certificadoCalibracion: "CERT-DICTUC-2026-081",
              numeroPrecintoAnterior: "PREC-ANT-90",
              numeroPrecintoNuevo: "PREC-AG-2026-01",
              observaciones: "Calibración reglamentaria y colocación de precinto de seguridad sellado.",
            },
          });
          await prisma.medidor.update({
            where: { id: medidorAgNorteId },
            data: {
              precintoActual: "PREC-AG-2026-01",
              fechaUltimaCalibracion: new Date(ahora - 90 * 24 * 3600 * 1000),
              fechaProximaCalibracion: new Date(ahora + 275 * 24 * 3600 * 1000),
            },
          });
        }
      }

      return reply.status(200).send({
        status: "ok",
        message: "Demostración y usuarios RBAC inicializados exitosamente",
        credencialesDemo: [
          { email: "admin@medidores.cl", pass: "demo1234", rol: "ADMIN" },
          { email: "supervisor@medidores.cl", pass: "demo1234", rol: "SUPERVISOR", instalacion: "Planta Industrial Norte" },
          { email: "operador@medidores.cl", pass: "demo1234", rol: "OPERADOR", instalaciones: ["Planta Norte", "Corporativo"] },
        ],
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: "SEED_FAILED", message: errorMsg });
    }
  });

  // 4. Adaptadores de verificación entre módulos
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

  const reportesRepo = new PrismaReportesRepository(prisma);
  const reportesService = new ReportesService(reportesRepo);

  const alertasRepo = new PrismaAlertasRepository(prisma);
  const alertasService = new AlertasService(alertasRepo);

  const mantenimientoRepo = new PrismaMantenimientoRepository(prisma);
  const mantenimientoService = new MantenimientoService(mantenimientoRepo);

  // 5. Registro de Controladores
  await app.register(createUsuariosController(usuariosService), { prefix: "/api" });
  await app.register(createInstalacionesController(instalacionesService), { prefix: "/api" });
  await app.register(createMedidoresController(medidoresService), { prefix: "/api" });
  await app.register(createLecturasController(lecturasService), { prefix: "/api" });
  await app.register(createDashboardController(dashboardService), { prefix: "/api" });
  await app.register(createReportesController(reportesService), { prefix: "/api" });
  await app.register(createAlertasController(alertasService), { prefix: "/api" });
  await app.register(createMantenimientoController(mantenimientoService), { prefix: "/api" });

  // 6. Endpoints complementarios para Frontend & RBAC
  app.get("/api/instalaciones", async () => {
    return await prisma.instalacion.findMany({ where: { activa: true } });
  });

  app.get("/api/medidores/tipos", async () => {
    return await prisma.tipoMedidor.findMany({ where: { activo: true } });
  });

  app.get("/api/instalaciones/operador/:usuarioId", async (req: FastifyRequest<{ Params: { usuarioId: string } }>) => {
    const asignaciones = await prisma.asignacionOperador.findMany({
      where: { usuarioId: req.params.usuarioId },
      include: { instalacion: true },
    });
    return asignaciones.map((a) => a.instalacion).filter((i) => i.activa);
  });

  app.get("/api/lecturas/recientes", async (req: FastifyRequest<{ Querystring: { limit?: string } }>) => {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;
    return await dashboardService.obtenerActividadReciente(limit);
  });

  return app;
}
