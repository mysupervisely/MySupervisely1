import { prisma } from "./client.js";

export interface MedicationReferenceMatch {
  id: string;
  name: string;
  strength: string | null;
  dosageForm: string | null;
  isSynthetic: boolean;
  source: string;
}

/**
 * The Medication Data Abstraction Layer described in
 * docs/doseprepped/ARCHITECTURE.md. Callers depend on this interface, not
 * on how the data is actually sourced — today that's a small synthetic
 * table seeded for demo purposes; a future implementation could query
 * RxNorm, DailyMed, or another licensed source instead, without any caller
 * (the API route, the frontend) needing to change.
 */
export interface MedicationDataProvider {
  search(query: string): Promise<MedicationReferenceMatch[]>;
}

const MAX_RESULTS = 10;

export const medicationReferenceProvider: MedicationDataProvider = {
  async search(query: string): Promise<MedicationReferenceMatch[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const rows = await prisma.medicationReference.findMany({
      where: { name: { contains: trimmed, mode: "insensitive" } },
      orderBy: { name: "asc" },
      take: MAX_RESULTS,
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      strength: row.strength,
      dosageForm: row.dosageForm,
      isSynthetic: row.isSynthetic,
      source: row.source,
    }));
  },
};
