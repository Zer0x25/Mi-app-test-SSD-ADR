import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { FastifyInstance } from "fastify";
import { configurePrismaSQLite, createHotBackup } from "../../src/core/database.js";
import { buildServer } from "../../src/server.js";
import { signJwt } from "../../src/modules/usuarios/auth.utils.js";
import { config } from "../../src/core/config.js";

describe("SQLite Pragmas & Hot Backup (Hito 12)", () => {
  const prisma = new PrismaClient();
  let app: FastifyInstance;
  const testBackupDir = path.join(process.cwd(), "backups", "test-backups");

  beforeAll(async () => {
    await configurePrismaSQLite(prisma);
    app = await buildServer({ prisma, serveStatic: false });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
    if (fs.existsSync(testBackupDir)) {
      fs.rmSync(testBackupDir, { recursive: true, force: true });
    }
  });

  it("debe configurar correctamente los PRAGMAs de SQLite (WAL, busy_timeout, foreign_keys)", async () => {
    const journalModeResult = await prisma.$queryRawUnsafe<Array<{ journal_mode: string }>>(
      "PRAGMA journal_mode;"
    );
    expect(journalModeResult[0].journal_mode.toLowerCase()).toBe("wal");

    const busyTimeoutResult = await prisma.$queryRawUnsafe<Array<{ timeout: bigint | number }>>(
      "PRAGMA busy_timeout;"
    );
    const timeout = Number(busyTimeoutResult[0].timeout);
    expect(timeout).toBeGreaterThanOrEqual(5000);

    const foreignKeysResult = await prisma.$queryRawUnsafe<Array<{ foreign_keys: bigint | number }>>(
      "PRAGMA foreign_keys;"
    );
    expect(Number(foreignKeysResult[0].foreign_keys)).toBe(1);
  });

  it("createHotBackup debe generar un archivo de backup en caliente consistente", async () => {
    const backupResult = await createHotBackup(prisma, {
      backupDir: testBackupDir,
      customFilename: "test-snapshot.db",
    });

    expect(backupResult.status).toBe("ok");
    expect(backupResult.archivo).toBe("test-snapshot.db");
    expect(fs.existsSync(backupResult.rutaAbsoluta)).toBe(true);
    expect(backupResult.tamanoBytes).toBeGreaterThan(0);
    expect(new Date(backupResult.timestamp).getTime()).not.toBeNaN();
  });

  it("POST /api/admin/backup debe rechazar solicitudes sin token (401)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/backup",
    });

    expect(res.statusCode).toBe(401);
  });

  it("POST /api/admin/backup debe denegar acceso a rol OPERADOR o SUPERVISOR (403)", async () => {
    const tokenOperador = signJwt(
      {
        userId: "11111111-1111-1111-1111-111111111111",
        email: "operador@medidores.cl",
        nombre: "Operador Test",
        rol: "OPERADOR",
      },
      config.JWT_SECRET
    );

    const resOperador = await app.inject({
      method: "POST",
      url: "/api/admin/backup",
      headers: { authorization: `Bearer ${tokenOperador}` },
    });
    expect(resOperador.statusCode).toBe(403);

    const tokenSupervisor = signJwt(
      {
        userId: "22222222-2222-2222-2222-222222222222",
        email: "supervisor@medidores.cl",
        nombre: "Supervisor Test",
        rol: "SUPERVISOR",
      },
      config.JWT_SECRET
    );

    const resSupervisor = await app.inject({
      method: "POST",
      url: "/api/admin/backup",
      headers: { authorization: `Bearer ${tokenSupervisor}` },
    });
    expect(resSupervisor.statusCode).toBe(403);
  });

  it("POST /api/admin/backup debe permitir acceso a ADMIN y registrar evento de auditoría", async () => {
    const adminUser = await prisma.usuario.upsert({
      where: { email: "admin-backup-test@medidores.cl" },
      update: { rol: "ADMIN" },
      create: {
        email: "admin-backup-test@medidores.cl",
        passwordHash: "hash-fake",
        nombre: "Admin Backup Test",
        rol: "ADMIN",
      },
    });

    const tokenAdmin = signJwt(
      {
        userId: adminUser.id,
        email: adminUser.email,
        nombre: adminUser.nombre,
        rol: "ADMIN",
      },
      config.JWT_SECRET
    );

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/backup",
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: {
        nombreArchivo: "admin-api-test.db",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.archivo).toBe("admin-api-test.db");
    expect(body.tamanoBytes).toBeGreaterThan(0);

    // Verificar registro en AuditoriaEvento
    const auditoria = await prisma.auditoriaEvento.findFirst({
      where: {
        accion: "BACKUP_SISTEMA",
        usuarioId: adminUser.id,
      },
      orderBy: { createdAt: "desc" },
    });

    expect(auditoria).toBeDefined();
    expect(auditoria?.entidad).toBe("SISTEMA");
    expect(auditoria?.detalles).toContain("admin-api-test.db");

    // Limpieza
    if (fs.existsSync(body.rutaAbsoluta)) {
      fs.unlinkSync(body.rutaAbsoluta);
    }
  });
});
