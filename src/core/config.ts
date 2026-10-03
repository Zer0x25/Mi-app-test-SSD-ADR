import "dotenv/config";
import { z } from "zod";

/**
 * Esquema de validación estricto para las variables de entorno del sistema Medidores.
 * 
 * Centraliza la lectura de process.env.
 * REGLA INMUTABLE: Queda estrictamente prohibido acceder a process.env en cualquier
 * otro archivo del proyecto (servicios, repositorios, controladores).
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  PORT: z.coerce.number().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL es requerida"),
  JWT_SECRET: z.string().min(8, "JWT_SECRET debe tener al menos 8 caracteres"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
});

export type Config = z.infer<typeof envSchema>;

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    console.error("❌ Error crítico en variables de entorno:\n" + errorDetails);
    throw new Error("Variables de entorno inválidas o faltantes:\n" + errorDetails);
  }

  return Object.freeze(parsed.data);
}

export const config: Config = loadConfig();
