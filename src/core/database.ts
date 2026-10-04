import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { DomainError } from "./errors.js";

export const BackupRequestSchema = z.object({
  nombreArchivo: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_.-]+$/, "Nombre de archivo inválido. Solo caracteres alfanuméricos, guiones y puntos.")
    .optional(),
});

export type BackupRequest = z.infer<typeof BackupRequestSchema>;

export const BackupResponseSchema = z.object({
  status: z.literal("ok"),
  archivo: z.string(),
  rutaAbsoluta: z.string(),
  tamanoBytes: z.number().int().nonnegative(),
  timestamp: z.string().datetime(),
});

export type BackupResponse = z.infer<typeof BackupResponseSchema>;

export class BackupError extends DomainError {
  readonly code = "BACKUP_FAILED";
  readonly statusCode = 500;

  constructor(motivo: string, detalles?: Record<string, unknown>) {
    super(`Fallo al generar respaldo en caliente de la base de datos: ${motivo}`, detalles);
  }
}

/**
 * Aplica los PRAGMAs obligatorios de producción y concurrencia para SQLite:
 * - WAL mode: Desacopla lectores y escritores.
 * - busy_timeout: 5.000 ms de espera ante contención de escritura antes de arrojar SQLITE_BUSY.
 * - foreign_keys: Garantiza integridad referencial nativa a nivel de almacenamiento.
 * - synchronous = NORMAL: Óptimo balance entre durabilidad ACID y rendimiento I/O en WAL.
 */
export async function configurePrismaSQLite(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
    await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
    await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON;");
    await prisma.$queryRawUnsafe("PRAGMA synchronous = NORMAL;");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[SQLite] Advertencia al configurar PRAGMAs de base de datos: ${errorMsg}`);
  }
}

export interface HotBackupOptions {
  backupDir?: string;
  customFilename?: string;
}

/**
 * Genera una copia atómica consistente en caliente mediante SQLite VACUUM INTO.
 * No requiere detener el servidor ni bloquea a los lectores.
 */
export async function createHotBackup(
  prisma: PrismaClient,
  options: HotBackupOptions = {}
): Promise<BackupResponse> {
  const dir = options.backupDir || path.join(process.cwd(), "backups");

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const timestampIso = new Date().toISOString();
    const safeTimestamp = timestampIso.replace(/[:.]/g, "-");
    const filename = options.customFilename || `backup-${safeTimestamp}.db`;
    const targetPath = path.resolve(dir, filename);

    // Si ya existe el archivo destino, SQLite VACUUM INTO falla por diseño de seguridad
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }

    // VACUUM INTO requiere la ruta formateada con barras normales
    const normalizedPath = targetPath.replace(/\\/g, "/");
    await prisma.$executeRawUnsafe(`VACUUM INTO '${normalizedPath}'`);

    const stats = fs.statSync(targetPath);

    return {
      status: "ok",
      archivo: filename,
      rutaAbsoluta: targetPath,
      tamanoBytes: stats.size,
      timestamp: timestampIso,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new BackupError(errorMsg, { dir, customFilename: options.customFilename });
  }
}
