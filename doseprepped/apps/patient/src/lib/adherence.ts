import "server-only";
import { cookies } from "next/headers";
import { API_URL } from "./api";

export type AdherenceStatus = "TAKEN" | "MISSED" | "SKIPPED";

export interface AdherenceEvent {
  id: string;
  medicationId: string;
  scheduledAt: string;
  recordedAt: string;
  status: AdherenceStatus;
}

export interface AdherenceSummary {
  takenCount: number;
  missedCount: number;
  skippedCount: number;
  totalCount: number;
  /** null when there are zero recorded events — never shown as "0%". */
  adherencePercentage: number | null;
}

async function apiFetch(path: string): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  return fetch(`${API_URL}${path}`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
}

export async function getAdherence(
  medicationId: string,
): Promise<{ events: AdherenceEvent[]; summary: AdherenceSummary }> {
  const response = await apiFetch(`/medications/${encodeURIComponent(medicationId)}/adherence-events`);
  if (!response.ok) {
    return {
      events: [],
      summary: { takenCount: 0, missedCount: 0, skippedCount: 0, totalCount: 0, adherencePercentage: null },
    };
  }
  return (await response.json()) as { events: AdherenceEvent[]; summary: AdherenceSummary };
}
