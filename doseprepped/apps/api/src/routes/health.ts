import type { FastifyInstance } from "fastify";
import { prisma } from "@doseprepped/db";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    let database: "connected" | "unavailable" = "unavailable";
    try {
      await prisma.$queryRaw`SELECT 1`;
      database = "connected";
    } catch {
      database = "unavailable";
    }

    return {
      status: "ok",
      service: "doseprepped-api",
      database,
    };
  });
}
