import { config } from "./core/config.js";
import { buildServer } from "./server.js";

async function main() {
  try {
    const app = await buildServer({ serveStatic: true });

    await app.listen({
      port: config.PORT,
      host: "0.0.0.0",
    });

    console.log(`\n🚀 Servidor Sistema Medidores iniciado exitosamente:`);
    console.log(`📡 URL Principal: http://localhost:${config.PORT}`);
    console.log(`🔌 Health check:  http://localhost:${config.PORT}/api/health`);
    console.log(`📊 Dashboard API: http://localhost:${config.PORT}/api/dashboard/kpis\n`);
  } catch (error) {
    console.error("❌ Error fatal al iniciar el servidor:", error);
    process.exit(1);
  }
}

main();
