import "server-only";
import { cookies } from "next/headers";
import { API_URL } from "./api";

export interface AnalyticsReport {
  range: { from: string; to: string };
  patientEngagement: {
    patientsActivated: number;
    activePatients: number;
    totalPatients: number;
    medicationRecordsAdded: number;
    totalMedicationRecords: number;
    medicationViews: number;
    adherenceEventsRecorded: number;
    checkInsCompleted: number;
    questionsSubmitted: number;
    repeatPatients: number;
  };
  questionFunnel: {
    totalQuestions: number;
    byCategory: Record<string, number>;
    byDisposition: Record<string, number>;
  };
  ai: {
    invoked: number;
    succeeded: number;
    failed: number;
    skipped: number;
    educationGenerated: number;
    clarifyingQuestionsIssued: number;
    resolvedByAiWithoutPharmacist: number;
    routedToPharmacistInstead: number;
    tokenUsage: { inputTokens: number; outputTokens: number };
  };
  pharmacist: {
    enteredQueue: number;
    claimed: number;
    responded: number;
    escalated: number;
    unclaimedQueueVolume: number;
    averageWaitToClaimMs: number | null;
    averageResponseTimeMs: number | null;
    averageQueueAgingMs: number | null;
  };
  providerEscalation: {
    reachedPharmacist: number;
    automaticRoutingCount: number;
    pharmacistInitiatedCount: number;
    totalEscalatedToProvider: number;
    escalationRate: number | null;
    resolvedWithoutProviderEscalation: number;
    resolvedWithoutProviderEscalationRate: number | null;
    escalationReasonBreakdown: Record<string, number>;
    urgentEmergencyCount: number;
  };
  adherenceCheckIn: {
    adherenceEventsRecorded: number;
    takenCount: number;
    missedCount: number;
    skippedCount: number;
    adherenceRatePercent: number | null;
    checkInsCompleted: number;
    checkInResponseBreakdown: Record<string, number>;
  };
  roiOperationalMetrics: {
    questionsPerThousandPatients: number | null;
    pharmacistCasesPerThousandPatients: number | null;
    providerEscalationsPerThousandPatients: number | null;
    percentResolvedWithoutProviderEscalation: number | null;
    averagePharmacistResponseTimeMs: number | null;
    note: string;
  };
}

async function apiFetch(path: string): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  return fetch(`${API_URL}${path}`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
}

export async function getAnalyticsReport(): Promise<AnalyticsReport | null> {
  const response = await apiFetch("/admin/analytics/report");
  if (!response.ok) return null;
  return (await response.json()) as AnalyticsReport;
}
