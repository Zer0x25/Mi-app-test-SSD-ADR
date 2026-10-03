import { describe, it, expect, afterAll } from "vitest";
import { buildServer } from "../src/server.js";
import { FastifyInstance } from "fastify";

describe("Fastify Server E2E Health Check", () => {
  let app: FastifyInstance;

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("GET /api/health debe responder 200 con status ok", async () => {
    app = await buildServer({ serveStatic: false });
    await app.ready();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("Sistema Medidores");
  });
});
