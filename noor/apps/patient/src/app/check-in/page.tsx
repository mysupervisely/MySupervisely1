"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CheckInQuestionDTO, CheckInDetailDTO, CheckInResponseDTO } from "@noor/types";
import { apiFetch, ApiError } from "../../lib/api";
import { NoorLogo } from "../../components/NoorLogo";

interface Me {
  roles: string[];
}

type AnswerValue = number | string;
type AnswersMap = Record<string, AnswerValue>;
type Phase = "loading" | "intro" | "question" | "review" | "confirmation";

// The exact, product-approved safety sentence (M3 brief §"safety/
// escalation"). This is NOT an emergency/crisis tool, must never be
// presented as one, and must never silently drop this disclaimer.
// Anything further than this one sentence — naming a specific crisis
// line, a phone number, or other emergency resource — is explicitly
// [NEEDS CLINICAL/LEGAL REVIEW] and must not be invented on this page;
// see docs/noor/M3-IMPLEMENTATION.md "Safety/escalation."
const SAFETY_DISCLAIMER = "This check-in is not monitored continuously and should not be used for emergencies.";

function responseValue(response: CheckInResponseDTO): AnswerValue | undefined {
  if (response.valueNumeric !== null) return response.valueNumeric;
  if (response.valueOptionKey !== null) return response.valueOptionKey;
  if (response.valueText !== null) return response.valueText;
  return undefined;
}

function initialAnswersFrom(detail: CheckInDetailDTO): AnswersMap {
  const answers: AnswersMap = {};
  for (const response of detail.responses) {
    const value = responseValue(response);
    if (value !== undefined) answers[response.questionKey] = value;
  }
  return answers;
}

/** The first still-unanswered *required* question, given whatever's
 * already saved on a resumed draft — mirrors onboarding's resume
 * behavior (M2): a returning patient is dropped back where they left
 * off, never made to re-answer what they already saved. If every
 * required question already has an answer, the check-in is ready for
 * review. */
function firstIncompleteIndex(questions: CheckInQuestionDTO[], answers: AnswersMap): number {
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]!;
    if (question.isRequired && answers[question.key] === undefined) return i;
  }
  return questions.length;
}

function optionLabel(question: CheckInQuestionDTO, key: string): string {
  return question.options?.find((option) => option.key === key)?.label ?? key;
}

// The Noor Check-In wizard (M3 brief §1-§8): a short, structured,
// data-driven flow extending continuity of care between live therapy
// sessions — NOT a standalone async/messaging product, and NOT an
// emergency/crisis tool. Every question rendered below comes from
// GET /check-ins/questions; nothing about a specific question (its
// wording, its options, how many there are) is hardcoded here, so a
// question change is a data change, never a code change.
export default function CheckInPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<CheckInQuestionDTO[]>([]);
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const me = await apiFetch<Me>("/auth/me");
        if (cancelled) return;
        if (!me.roles.includes("PATIENT")) {
          setError("This account is not a patient account.");
          return;
        }
        // POST /check-ins is idempotent get-or-create (brief §7: "prefer
        // one active draft per patient") — this single call both starts a
        // fresh check-in and resumes an in-progress one.
        const [fetchedQuestions, draft] = await Promise.all([
          apiFetch<CheckInQuestionDTO[]>("/check-ins/questions"),
          apiFetch<CheckInDetailDTO>("/check-ins", { method: "POST" }),
        ]);
        if (cancelled) return;
        const initialAnswers = initialAnswersFrom(draft);
        setQuestions(fetchedQuestions);
        setCheckInId(draft.id);
        setAnswers(initialAnswers);
        if (Object.keys(initialAnswers).length === 0) {
          setPhase("intro");
        } else {
          const resumeIndex = firstIncompleteIndex(fetchedQuestions, initialAnswers);
          if (resumeIndex >= fetchedQuestions.length) {
            setPhase("review");
          } else {
            setStepIndex(resumeIndex);
            setPhase("question");
          }
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Something went wrong.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function saveAnswer(key: string, value: AnswerValue) {
    if (!checkInId) return;
    await apiFetch(`/check-ins/${checkInId}/responses`, {
      method: "PATCH",
      body: JSON.stringify({ [key]: value }),
    });
  }

  function setAnswer(key: string, value: AnswerValue) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  async function onContinue() {
    const question = questions[stepIndex];
    if (!question) return;
    const value = answers[question.key];
    if (question.isRequired && (value === undefined || value === "")) {
      setStepError("Please answer before continuing.");
      return;
    }
    setStepError(null);
    setSaving(true);
    try {
      if (value !== undefined && value !== "") {
        await saveAnswer(question.key, value);
      }
      if (stepIndex === questions.length - 1) {
        setPhase("review");
      } else {
        setStepIndex((i) => i + 1);
      }
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onBack() {
    const question = questions[stepIndex];
    // Best-effort save of whatever's currently entered before navigating
    // back, so an in-progress edit isn't silently lost — but Back always
    // succeeds even if this save fails; the next Continue on this
    // question retries it.
    if (question) {
      const value = answers[question.key];
      if (value !== undefined && value !== "") {
        await saveAnswer(question.key, value).catch(() => undefined);
      }
    }
    setStepError(null);
    if (stepIndex === 0) {
      setPhase("intro");
    } else {
      setStepIndex((i) => i - 1);
    }
  }

  function onEditQuestion(index: number) {
    setStepError(null);
    setStepIndex(index);
    setPhase("question");
  }

  async function onSubmit() {
    if (!checkInId) return;
    setStepError(null);
    setSaving(true);
    try {
      await apiFetch<CheckInDetailDTO>(`/check-ins/${checkInId}/submit`, { method: "POST" });
      setPhase("confirmation");
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAndExit() {
    const question = questions[stepIndex];
    if (question) {
      const value = answers[question.key];
      if (value !== undefined && value !== "") {
        await saveAnswer(question.key, value).catch(() => undefined);
      }
    }
    router.push("/home");
  }

  if (error) {
    return (
      <main className="noor-shell noor-center">
        <p className="noor-error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (phase === "loading") {
    return (
      <main className="noor-shell noor-center">
        <p className="noor-muted">Loading...</p>
      </main>
    );
  }

  if (phase === "intro") {
    return (
      <main className="noor-shell noor-center">
        <NoorLogo />
        <div className="noor-hero" style={{ padding: "1.5rem 0" }}>
          <h1>Noor Check-In</h1>
          <p className="noor-muted">
            Take a few minutes to check in with how you&apos;ve been doing. Your responses help your care team stay
            connected with you between sessions.
          </p>
        </div>
        <button type="button" className="noor-button" onClick={() => setPhase("question")} autoFocus>
          Begin Check-In
        </button>
        <p className="noor-muted" style={{ fontSize: "0.82rem", marginTop: "1.5rem" }}>
          {SAFETY_DISCLAIMER}
        </p>
      </main>
    );
  }

  if (phase === "confirmation") {
    return (
      <main className="noor-shell noor-center">
        <NoorLogo />
        <div className="noor-hero" style={{ padding: "1.5rem 0" }}>
          <h1>Your check-in has been submitted.</h1>
          <p className="noor-muted">Your care team can review your responses.</p>
        </div>
        <div className="noor-button-row" style={{ justifyContent: "center" }}>
          <Link href="/home" className="noor-button">
            Return to Home
          </Link>
          <Link href="/check-in/history" className="noor-button noor-button--secondary">
            View check-in history
          </Link>
        </div>
        <p className="noor-muted" style={{ fontSize: "0.82rem", marginTop: "1.5rem" }}>
          {SAFETY_DISCLAIMER}
        </p>
      </main>
    );
  }

  if (phase === "review") {
    return (
      <main className="noor-shell">
        <NoorLogo />
        <div className="noor-section">
          <h1>Review your check-in</h1>
          <p className="noor-muted">Take a look before submitting. You can edit any answer.</p>

          {stepError && (
            <p className="noor-error" role="alert">
              {stepError}
            </p>
          )}

          <div className="noor-stack">
            {questions.map((question, index) => {
              const value = answers[question.key];
              const hasValue = value !== undefined && value !== "";
              let display: string;
              if (!hasValue) {
                display = "Not answered";
              } else if (question.responseType === "SCALE_1_10") {
                display = `${value}/10`;
              } else if (question.responseType === "SINGLE_SELECT") {
                display = optionLabel(question, String(value));
              } else {
                display = String(value);
              }
              return (
                <div className="noor-card noor-card--muted" key={question.key}>
                  <div className="noor-entry-card-head">
                    <p style={{ margin: 0, fontWeight: 500 }}>{question.promptText}</p>
                    <button type="button" className="noor-link-button" onClick={() => onEditQuestion(index)}>
                      Edit
                    </button>
                  </div>
                  <p className="noor-muted" style={{ margin: 0 }}>
                    {display}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="noor-muted" style={{ fontSize: "0.82rem", marginTop: "1.5rem" }}>
            {SAFETY_DISCLAIMER}
          </p>

          <div className="noor-button-row">
            <button
              type="button"
              className="noor-button noor-button--secondary"
              onClick={() => setPhase("question")}
              disabled={saving}
            >
              Back
            </button>
            <button type="button" className="noor-button" onClick={onSubmit} disabled={saving}>
              {saving ? "Submitting..." : "Submit Check-In"}
            </button>
          </div>
        </div>
      </main>
    );
  }

  // --- Question steps ---
  const question = questions[stepIndex];
  if (!question) {
    return (
      <main className="noor-shell noor-center">
        <p className="noor-muted">Loading...</p>
      </main>
    );
  }
  const progress = Math.round(((stepIndex + 1) / questions.length) * 100);
  const value = answers[question.key];

  return (
    <main className="noor-shell">
      <div className="noor-center">
        <NoorLogo />
      </div>
      <div className="noor-section">
        <span className="noor-step-label">
          Question {stepIndex + 1} of {questions.length}
        </span>
        <div
          className="noor-progress-track"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="noor-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="noor-card noor-section">
          <h2>{question.promptText}</h2>

          {stepError && (
            <p className="noor-error" role="alert">
              {stepError}
            </p>
          )}

          {question.responseType === "SCALE_1_10" && (
            <fieldset className="noor-fieldset">
              <legend className="noor-legend">{question.promptText}</legend>
              <div className="noor-scale-group" role="radiogroup" aria-label={question.promptText}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <label className="noor-scale-option" key={n}>
                    <input
                      type="radio"
                      name={question.key}
                      value={n}
                      checked={value === n}
                      onChange={() => setAnswer(question.key, n)}
                    />
                    {n}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {question.responseType === "SINGLE_SELECT" && (
            <fieldset className="noor-fieldset">
              <legend className="noor-legend">{question.promptText}</legend>
              <div className="noor-radio-cards">
                {(question.options ?? []).map((option) => (
                  <label className="noor-radio-card" key={option.key}>
                    <input
                      type="radio"
                      name={question.key}
                      value={option.key}
                      checked={value === option.key}
                      onChange={() => setAnswer(question.key, option.key)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {question.responseType === "FREE_TEXT" && (
            <div className="noor-field">
              <label htmlFor={question.key}>Your answer (optional)</label>
              <textarea
                id={question.key}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => setAnswer(question.key, e.target.value)}
                maxLength={2000}
              />
            </div>
          )}

          <div className="noor-button-row">
            <button type="button" className="noor-button noor-button--secondary" onClick={onBack} disabled={saving}>
              Back
            </button>
            <button type="button" className="noor-button" onClick={onContinue} disabled={saving}>
              {saving ? "Saving..." : "Continue"}
            </button>
          </div>
        </div>

        <div className="noor-center">
          <button type="button" className="noor-link-button" style={{ marginTop: "1.25rem" }} onClick={onSaveAndExit}>
            Save and finish later
          </button>
        </div>
      </div>
    </main>
  );
}
