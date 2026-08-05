import { z } from "zod";

/**
 * The four account roles Noor supports (docs/noor/ARCHITECTURE.md §E).
 * Kept as a plain, framework-agnostic union here — mirroring the `RoleName`
 * enum in packages/db/prisma/schema.prisma — so frontend code can depend on
 * it without pulling in the Prisma client.
 */
export const ROLES = ["PATIENT", "CLINICIAN", "ADMIN", "SUPER_ADMIN"] as const;

export const roleSchema = z.enum(ROLES);

export type Role = z.infer<typeof roleSchema>;
