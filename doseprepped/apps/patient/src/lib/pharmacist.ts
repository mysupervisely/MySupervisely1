import "server-only";
import { cookies } from "next/headers";
import { API_URL } from "./api";
import type { QuestionCategory, QuestionDisposition } from "./questions";

export type QueueTab = "NEW" | "IN_REVIEW" | "COMPLETED" | "ESCALATED";

export interface PharmacistMedicationSnapshot {
  name: string;
  strength: string;
  dosageForm?: string;
  directions: string;
  frequency: string;
  route: string;
}

// M5.2 — bounded medication-journey context shown alongside a single
// question the pharmacist already has access to. See
// docs/doseprepped/ARCHITECTURE.md "M5.2 — Pharmacist context". Only
// present on the single-question detail fetch, never the queue list.
export interface PharmacistMedicationContext {
  startedAt: string | null;
  adherence: {
    takenCount: number;
    missedCount: number;
    skippedCount: number;
    totalCount: number;
    adherencePercentage: number | null;
  } | null;
  recentCheckIn: {
    response: string;
    notes: string | null;
    occurredAt: string;
  } | null;
  recentQuestion: {
    category: QuestionCategory;
    questionText: string;
    occurredAt: string;
    status: string;
  } | null;
}

export interface PharmacistQuestion {
  id: string;
  medicationSnapshot: PharmacistMedicationSnapshot;
  otherMedicationsSnapshot: { name: string; strength: string }[] | null;
  category: QuestionCategory;
  aiSuggestedCategory: QuestionCategory | null;
  questionText: string;
  disposition: QuestionDisposition | null;
  safetyRuleSetVersion: string | null;
  aiPharmacistSummary: string | null;
  status: string;
  pharmacistId: string | null;
  submittedAt: string;
  claimedAt: string | null;
  pharmacistResponse: string | null;
  respondedAt: string | null;
  escalatedAt: string | null;
  escalationReasonCategory: string | null;
  escalationReason: string | null;
  resolvedAt: string | null;
  /** Only present on GET /pharmacist/questions/:id, not the queue list. */
  medicationContext?: PharmacistMedicationContext;
}

export interface QueueCounts {
  new: number;
  inReview: number;
  completed: number;
  escalated: number;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, cookie: cookieHeader },
    cache: "no-store",
  });
}

export async function getQueue(
  tab?: QueueTab,
): Promise<{ counts: QueueCounts; questions: PharmacistQuestion[] }> {
  const response = await apiFetch(`/pharmacist/queue${tab ? `?tab=${tab}` : ""}`);
  if (!response.ok) {
    return { counts: { new: 0, inReview: 0, completed: 0, escalated: 0 }, questions: [] };
  }
  return (await response.json()) as { counts: QueueCounts; questions: PharmacistQuestion[] };
}

export async function getPharmacistQuestion(id: string): Promise<PharmacistQuestion | null> {
  const response = await apiFetch(`/pharmacist/questions/${encodeURIComponent(id)}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { question: PharmacistQuestion };
  return data.question;
}
