import { PrismaClient } from "@prisma/client";
import { config } from "./core/config.js";
import { buildServer } from "./server.js";

async function main() {
  const prisma = new PrismaClient();

  try {
    const app = await buildServer({ prisma, serveStatic: true });

    await app.listen({
      port: config.PORT,
      host: "0.0.0.0",
    });

    console.log(`\n🚀 Servidor Sistema Medidores iniciado exitosamente:`);
    console.log(`📡 URL Principal: http://localhost:${config.PORT}`);
    console.log(`🔌 Health check:  http://localhost:${config.PORT}/api/health`);
    console.log(`📊 Dashboard API: http://localhost:${config.PORT}/api/dashboard/kpis\n`);

    // Graceful Shutdown ante señales del sistema operativo (ADR 0009 / Hito 12)
    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      console.log(`\n🛑 Recibida señal ${signal}. Iniciando apagado ordenado (graceful shutdown)...`);

      // Timeout de seguridad para evitar que el proceso quede colgado indefinidamente
      const forceExitTimeout = setTimeout(() => {
        console.error("⚠️ Tiempo de espera de apagado agotado (10s). Forzando terminación del proceso.");
        process.exit(1);
      }, 10000);
      forceExitTimeout.unref();

      try {
        console.log("⏳ Cerrando servidor Fastify y drenando solicitudes en vuelo...");
        await app.close();
        console.log("✅ Servidor HTTP cerrado correctamente.");

        console.log("⏳ Desconectando cliente Prisma ORM...");
        await prisma.$disconnect();
        console.log("✅ Base de datos desconectada exitosamente.");

        console.log("👋 Apagado ordenado finalizado con éxito.");
        process.exit(0);
      } catch (err) {
        console.error("❌ Error durante el apagado ordenado:", err);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Error fatal al iniciar el servidor:", error);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }
}

main();
