import "server-only";
import { cookies } from "next/headers";
import { API_URL } from "./api";

export type TimelineEntryType =
  | "MEDICATION_STARTED"
  | "MEDICATION_ARCHIVED"
  | "DOSE_TAKEN"
  | "DOSE_MISSED"
  | "DOSE_SKIPPED"
  | "CHECK_IN_COMPLETED"
  | "QUESTION_SUBMITTED"
  | "PHARMACIST_RESPONDED"
  | "QUESTION_ESCALATED";

export interface TimelineEntry {
  type: TimelineEntryType;
  occurredAt: string;
  label: string;
  questionId?: string;
}

async function apiFetch(path: string): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  return fetch(`${API_URL}${path}`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
}

export async function getTimeline(medicationId: string): Promise<TimelineEntry[]> {
  const response = await apiFetch(`/medications/${encodeURIComponent(medicationId)}/timeline`);
  if (!response.ok) return [];
  const data = (await response.json()) as { timeline: TimelineEntry[] };
  return data.timeline;
}
