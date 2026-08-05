"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { API_URL } from "@/lib/api";
import { getDemoSessionCookie, invalidateDemoSession } from "@/lib/demo-auth";
import { getDemoPatientMedications } from "@/lib/demo";

/**
 * M6.0 — Demo Mode's only mutating actions. Each one authenticates
 * server-side as a fixed, isolated Demo Mode persona (never the
 * visitor's own identity — there is none) and calls the exact same,
 * unmodified API route the real patient/pharmacist app uses. See
 * docs/doseprepped/ARCHITECTURE.md "M6.0 — Demo Mode" for the full
 * design and docs/doseprepped/ARCHITECTURE.md "M6.0 — What stays
 * read-only" for why the two seeded "canned" scenarios are never
 * touched by any of these actions — they only ever create/modify a
 * fresh, disposable question submitted through `submitDemoQuestion`.
 */

// Fixed to match the milestone's recommended demo scenario — the visitor
// picks the *words*, never the medication or category, so a live
// submission always lands on the same deterministic disposition
// (SIDE_EFFECT + no escalation-pattern text -> PHARMACIST_REVIEW,
// per packages/safety-rules).
const DEMO_QUESTION_CATEGORY = "SIDE_EFFECT";

export async function submitDemoQuestion(formData: FormData): Promise<void> {
  const questionText = String(formData.get("questionText") ?? "").trim();
  if (!questionText) {
    redirect("/demo/patient?error=missing");
  }

  const cookie = await getDemoSessionCookie("patient");
  if (!cookie) {
    redirect("/demo/patient?error=unavailable");
  }

  // The medication is always resolved server-side from the demo
  // patient's own record — never trusted from the submitted form — so
  // this can only ever create a question about the demo patient's own
  // (single, seeded) Semaglutide medication.
  const medications = await getDemoPatientMedications();
  const semaglutide = medications.find((m) => m.name === "Semaglutide");
  if (!semaglutide) {
    redirect("/demo/patient?error=unavailable");
  }

  const response = await fetch(`${API_URL}/questions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      medicationId: semaglutide.id,
      category: DEMO_QUESTION_CATEGORY,
      questionText,
    }),
    cache: "no-store",
  });

  if (response.status === 401) invalidateDemoSession("patient");
  if (!response.ok) {
    redirect("/demo/patient?error=submit");
  }

  const data = (await response.json()) as { question: { id: string } };
  revalidatePath("/demo/patient");
  revalidatePath("/demo/pharmacist");
  redirect(`/demo/patient?submittedId=${encodeURIComponent(data.question.id)}`);
}

export async function claimDemoQuestion(formData: FormData): Promise<void> {
  const questionId = String(formData.get("questionId") ?? "");
  if (!questionId) return;

  const cookie = await getDemoSessionCookie("pharmacist");
  if (!cookie) return;

  const response = await fetch(`${API_URL}/pharmacist/questions/${encodeURIComponent(questionId)}/claim`, {
    method: "POST",
    headers: { cookie },
    cache: "no-store",
  });
  if (response.status === 401) invalidateDemoSession("pharmacist");

  revalidatePath("/demo/pharmacist");
}

export async function respondToDemoQuestion(formData: FormData): Promise<void> {
  const questionId = String(formData.get("questionId") ?? "");
  const responseText = String(formData.get("responseText") ?? "").trim();
  if (!questionId || !responseText) return;

  const cookie = await getDemoSessionCookie("pharmacist");
  if (!cookie) return;

  const response = await fetch(`${API_URL}/pharmacist/questions/${encodeURIComponent(questionId)}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ responseText }),
    cache: "no-store",
  });
  if (response.status === 401) invalidateDemoSession("pharmacist");

  revalidatePath("/demo/pharmacist");
}
