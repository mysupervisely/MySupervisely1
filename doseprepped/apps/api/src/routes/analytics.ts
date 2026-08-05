import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { Role } from "@doseprepped/db";
import { requireRole } from "../lib/auth.js";
import { buildAnalyticsReport } from "../lib/analytics-report.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

/**
 * M5.3 — aggregate pilot analytics reporting. See
 * docs/doseprepped/ARCHITECTURE.md "M5.3 — Reporting service" and
 * "Authorization". ADMIN-only: this returns aggregate business metrics,
 * never one patient's activity, but is still restricted to the one role
 * that has any business-analytics access today (patients never do;
 * pharmacists don't yet — see the architecture doc for why).
 */
export async function analyticsRoutes(app: FastifyInstance) {
  app.get(
    "/admin/analytics/report",
    { preHandler: requireRole(Role.ADMIN) },
    async (request, reply) => {
      const parsed = reportQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid query.", details: parsed.error.flatten() });
      }

      const to = parsed.data.to ?? new Date();
      const from = parsed.data.from ?? new Date(to.getTime() - THIRTY_DAYS_MS);

      if (from > to) {
        return reply.code(400).send({
          error: "Invalid input.",
          details: { fieldErrors: { from: ["'from' must be on or before 'to'."] } },
        });
      }

      const report = await buildAnalyticsReport({ from, to });
      return reply.send(report);
    },
  );
}
