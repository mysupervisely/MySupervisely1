import { AdherenceStatus } from "@doseprepped/db";

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
  occurredAt: Date;
  /** Patient-friendly summary — never a raw column name or internal enum value. */
  label: string;
  /** Present only for QUESTION_* entries, so the frontend can link to that question. */
  questionId?: string;
}

const CHECK_IN_LABELS: Record<string, string> = {
  DOING_WELL: "Checked in: doing well",
  HAVING_SOME_ISSUES: "Checked in: having some issues",
  HAVING_SIGNIFICANT_ISSUES: "Checked in: having significant issues",
  HAS_A_QUESTION: "Checked in: had a question",
};

interface MedicationInput {
  name: string;
  startDate: Date;
  archivedAt: Date | null;
}

interface AdherenceEventInput {
  scheduledAt: Date;
  status: AdherenceStatus;
}

interface CheckInInput {
  response: string;
  createdAt: Date;
}

interface QuestionInput {
  id: string;
  createdAt: Date;
  pharmacistRespondedAt: Date | null;
  escalatedAt: Date | null;
}

export interface TimelineInput {
  medication: MedicationInput;
  adherenceEvents: AdherenceEventInput[];
  checkIns: CheckInInput[];
  questions: QuestionInput[];
}

/**
 * Derives a chronologically-sorted patient medication timeline purely
 * from already-existing records — no new storage. See
 * docs/doseprepped/ARCHITECTURE.md "M5.2 — Patient medication journey
 * (timeline)". Every entry carries only a patient-friendly label plus the
 * minimum linking data the frontend needs — never a raw column name,
 * internal enum value, or another patient's data.
 */
export function buildMedicationTimeline(input: TimelineInput): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  entries.push({
    type: "MEDICATION_STARTED",
    occurredAt: input.medication.startDate,
    label: `Started ${input.medication.name}`,
  });

  if (input.medication.archivedAt) {
    entries.push({
      type: "MEDICATION_ARCHIVED",
      occurredAt: input.medication.archivedAt,
      label: `Marked ${input.medication.name} inactive`,
    });
  }

  for (const event of input.adherenceEvents) {
    if (event.status === AdherenceStatus.TAKEN) {
      entries.push({ type: "DOSE_TAKEN", occurredAt: event.scheduledAt, label: "Dose taken" });
    } else if (event.status === AdherenceStatus.MISSED) {
      entries.push({ type: "DOSE_MISSED", occurredAt: event.scheduledAt, label: "Dose missed" });
    } else if (event.status === AdherenceStatus.SKIPPED) {
      entries.push({ type: "DOSE_SKIPPED", occurredAt: event.scheduledAt, label: "Dose skipped" });
    }
  }

  for (const checkIn of input.checkIns) {
    entries.push({
      type: "CHECK_IN_COMPLETED",
      occurredAt: checkIn.createdAt,
      label: CHECK_IN_LABELS[checkIn.response] ?? "Check-in completed",
    });
  }

  for (const question of input.questions) {
    entries.push({
      type: "QUESTION_SUBMITTED",
      occurredAt: question.createdAt,
      label: "Question submitted",
      questionId: question.id,
    });
    if (question.pharmacistRespondedAt) {
      entries.push({
        type: "PHARMACIST_RESPONDED",
        occurredAt: question.pharmacistRespondedAt,
        label: "Pharmacist responded",
        questionId: question.id,
      });
    }
    if (question.escalatedAt) {
      entries.push({
        type: "QUESTION_ESCALATED",
        occurredAt: question.escalatedAt,
        label: "Question escalated for provider evaluation",
        questionId: question.id,
      });
    }
  }

  return entries.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
