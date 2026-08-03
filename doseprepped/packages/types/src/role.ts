import { z } from "zod";

/**
 * The three account roles DosePrepped supports. This mirrors the `Role`
 * enum in packages/db/prisma/schema.prisma but is kept as a plain,
 * framework-agnostic union here so frontend code can depend on it without
 * pulling in the Prisma client.
 */
export const ROLES = ["PATIENT", "PHARMACIST", "ADMIN"] as const;

export const roleSchema = z.enum(ROLES);

export type Role = z.infer<typeof roleSchema>;
