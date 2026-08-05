import "server-only";
import { API_URL } from "./api";
import { getDemoSessionCookie, invalidateDemoSession, type DemoPersona } from "./demo-auth";
import type { Medication } from "./medications";
import type { Question } from "./questions";
import type { PharmacistQuestion, QueueCounts } from "./pharmacist";
import type { AnalyticsReport } from "./analytics";
import type { Organization, OrganizationMember, MyOrgMembership } from "./organizations";

/**
 * M6.0 — Demo Mode read-only data access. Every function here calls an
 * EXISTING, unmodified API route (the same ones the real patient/
 * pharmacist/org-admin pages call) — see docs/doseprepped/ARCHITECTURE.md
 * "M6.0 — Demo Mode". The only difference from the real pages' data
 * helpers (lib/questions.ts, lib/pharmacist.ts, lib/organizations.ts,
 * lib/analytics.ts) is the source of the session cookie: those forward
 * the visitor's own cookies (`next/headers` `cookies()`); these use a
 * fixed Demo Mode persona's cookie (`lib/demo-auth.ts`), since an
 * anonymous demo visitor never has a real session of their own.
 */

async function demoApiFetch(persona: DemoPersona, path: string, init?: RequestInit): Promise<Response | null> {
  const cookie = await getDemoSessionCookie(persona);
  if (!cookie) return null;

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...init?.headers, cookie },
    cache: "no-store",
  });

  if (response.status === 401) {
    // The cached session went stale (e.g. server restarted and the
    // in-memory cache is out of sync with reality) — drop it so the
    // next call re-authenticates instead of repeating the same failure.
    invalidateDemoSession(persona);
  }

  return response;
}

// The two seeded "canned" scenarios' exact question text — see
// packages/db/prisma/seed.ts "M6.0 demo data". Matched by exact text
// (not e.g. "first question") so they stay identifiable as more live,
// disposable questions accumulate for demo-mode-patient over time.
export const DEMO_CANNED_NAUSEA_TEXT =
  "I've been feeling nauseous since starting my medication. Is this normal?";
export const DEMO_CANNED_ESCALATION_TEXT =
  "The redness at my injection site seems to be getting worse over the last two days.";

// --- Patient perspective ---------------------------------------------

export async function getDemoPatientMedications(): Promise<Medication[]> {
  const response = await demoApiFetch("patient", "/medications");
  if (!response?.ok) return [];
  const data = (await response.json()) as { medications: Medication[] };
  return data.medications;
}

export async function getDemoPatientQuestion(id: string): Promise<Question | null> {
  const response = await demoApiFetch("patient", `/questions/${encodeURIComponent(id)}`);
  if (!response?.ok) return null;
  const data = (await response.json()) as { question: Question };
  return data.question;
}

export async function getDemoPatientQuestions(): Promise<Question[]> {
  const response = await demoApiFetch("patient", "/questions");
  if (!response?.ok) return [];
  const data = (await response.json()) as { questions: Question[] };
  return data.questions;
}

/** The two read-only, never-mutated canned scenarios, from the patient's
 * own point of view. Either may be null if the seed hasn't run yet. */
export async function getDemoCannedQuestions(): Promise<{ nausea: Question | null; escalation: Question | null }> {
  const questions = await getDemoPatientQuestions();
  return {
    nausea: questions.find((q) => q.questionText === DEMO_CANNED_NAUSEA_TEXT) ?? null,
    escalation: questions.find((q) => q.questionText === DEMO_CANNED_ESCALATION_TEXT) ?? null,
  };
}

/** Anything demo-mode-patient has submitted live through "Try it
 * yourself" — always disposable, never one of the two canned records. */
export async function getDemoLiveQuestions(): Promise<Question[]> {
  const questions = await getDemoPatientQuestions();
  return questions.filter(
    (q) => q.questionText !== DEMO_CANNED_NAUSEA_TEXT && q.questionText !== DEMO_CANNED_ESCALATION_TEXT,
  );
}

// --- Pharmacist perspective -------------------------------------------

export async function getDemoPharmacistQueue(): Promise<{ counts: QueueCounts; questions: PharmacistQuestion[] }> {
  const response = await demoApiFetch("pharmacist", "/pharmacist/queue");
  if (!response?.ok) return { counts: { new: 0, inReview: 0, completed: 0, escalated: 0 }, questions: [] };
  return (await response.json()) as { counts: QueueCounts; questions: PharmacistQuestion[] };
}

export async function getDemoPharmacistQuestion(id: string): Promise<PharmacistQuestion | null> {
  const response = await demoApiFetch("pharmacist", `/pharmacist/questions/${encodeURIComponent(id)}`);
  if (!response?.ok) return null;
  const data = (await response.json()) as { question: PharmacistQuestion };
  return data.question;
}

/** The two canned scenarios with full pharmacist-view detail (medication
 * journey context, AI pharmacist summary, etc.) — read-only display only,
 * never re-claimed/re-answered (both are already resolved/escalated). */
export async function getDemoCannedPharmacistQuestions(): Promise<{
  nausea: PharmacistQuestion | null;
  escalation: PharmacistQuestion | null;
}> {
  const { questions } = await getDemoPharmacistQueue();
  const nauseaSummary = questions.find((q) => q.questionText === DEMO_CANNED_NAUSEA_TEXT);
  const escalationSummary = questions.find((q) => q.questionText === DEMO_CANNED_ESCALATION_TEXT);
  const [nausea, escalation] = await Promise.all([
    nauseaSummary ? getDemoPharmacistQuestion(nauseaSummary.id) : Promise.resolve(null),
    escalationSummary ? getDemoPharmacistQuestion(escalationSummary.id) : Promise.resolve(null),
  ]);
  return { nausea, escalation };
}

/** Live, unclaimed/in-progress questions demo-mode-pharmacist can act
 * on — anything submitted through the Patient Experience's "Try it
 * yourself" form, excluding the two canned scenarios. */
export async function getDemoLivePharmacistQuestions(): Promise<PharmacistQuestion[]> {
  const { questions } = await getDemoPharmacistQueue();
  return questions.filter(
    (q) => q.questionText !== DEMO_CANNED_NAUSEA_TEXT && q.questionText !== DEMO_CANNED_ESCALATION_TEXT,
  );
}

// --- Organization admin perspective ------------------------------------

async function getDemoOrganizationId(): Promise<string | null> {
  const response = await demoApiFetch("admin", "/organizations/me");
  if (!response?.ok) return null;
  const data = (await response.json()) as { memberships: MyOrgMembership[] };
  const membership = data.memberships.find((m) => m.role === "ORG_ADMIN");
  return membership?.organizationId ?? null;
}

export async function getDemoOrganization(): Promise<Organization | null> {
  const organizationId = await getDemoOrganizationId();
  if (!organizationId) return null;
  const response = await demoApiFetch("admin", `/organizations/${encodeURIComponent(organizationId)}`);
  if (!response?.ok) return null;
  const data = (await response.json()) as { organization: Organization };
  return data.organization;
}

export async function getDemoOrganizationMembers(): Promise<OrganizationMember[]> {
  const organizationId = await getDemoOrganizationId();
  if (!organizationId) return [];
  const response = await demoApiFetch("admin", `/organizations/${encodeURIComponent(organizationId)}/memberships`);
  if (!response?.ok) return [];
  const data = (await response.json()) as { memberships: OrganizationMember[] };
  return data.memberships;
}

export async function getDemoOrganizationAnalytics(range?: {
  from?: string;
  to?: string;
}): Promise<AnalyticsReport | null> {
  const organizationId = await getDemoOrganizationId();
  if (!organizationId) return null;

  const params = new URLSearchParams();
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const query = params.toString();

  const response = await demoApiFetch(
    "admin",
    `/organizations/${encodeURIComponent(organizationId)}/analytics/report${query ? `?${query}` : ""}`,
  );
  if (!response?.ok) return null;
  return (await response.json()) as AnalyticsReport;
}
