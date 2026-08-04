import "server-only";
import { cookies } from "next/headers";
import { API_URL } from "./api";

export type QuestionCategory =
  | "GENERAL_INFO"
  | "ADMINISTRATION"
  | "MISSED_DOSE"
  | "SIDE_EFFECT"
  | "DRUG_INTERACTION"
  | "STORAGE"
  | "ADHERENCE"
  | "COST_ACCESS"
  | "OTHER";

export type QuestionStatus =
  | "RECEIVED"
  | "AI_PROCESSING"
  | "AI_ANSWERED"
  | "PHARMACIST_REQUESTED"
  | "PHARMACIST_IN_PROGRESS"
  | "WAITING_FOR_PATIENT"
  | "PHARMACIST_RESOLVED"
  | "ESCALATED"
  | "CLOSED";

export type QuestionDisposition =
  | "GENERAL_EDUCATION"
  | "PHARMACIST_REVIEW"
  | "PROVIDER_EVALUATION"
  | "URGENT_EMERGENCY";

export interface MedicationSnapshot {
  name: string;
  strength: string;
  directions: string;
  frequency: string;
  route: string;
}

export interface Question {
  id: string;
  medicationId: string;
  medicationSnapshot: MedicationSnapshot;
  otherMedicationsSnapshot: { name: string; strength: string }[] | null;
  category: QuestionCategory;
  aiSuggestedCategory: QuestionCategory | null;
  questionText: string;
  disposition: QuestionDisposition | null;
  dispositionSource: "DETERMINISTIC" | "AI_ASSISTED" | null;
  dispositionRuleIds: string[];
  safetyRuleSetVersion: string | null;
  dispositionAssignedAt: string | null;
  aiEducationResponse: string | null;
  aiEducationGeneratedAt: string | null;
  aiResponseStatus: "SUCCESS" | "FAILED" | "SKIPPED" | null;
  clarifyingQuestion: string | null;
  status: QuestionStatus;
  pharmacistResponse: string | null;
  escalatedAt: string | null;
  escalationReason: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

async function apiFetch(path: string): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  return fetch(`${API_URL}${path}`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
}

export async function getQuestions(): Promise<Question[]> {
  const response = await apiFetch("/questions");
  if (!response.ok) return [];
  const data = (await response.json()) as { questions: Question[] };
  return data.questions;
}

export async function getQuestion(id: string): Promise<Question | null> {
  const response = await apiFetch(`/questions/${encodeURIComponent(id)}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { question: Question };
  return data.question;
}
