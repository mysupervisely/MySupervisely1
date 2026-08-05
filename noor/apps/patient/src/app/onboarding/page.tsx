"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CARE_TYPES,
  CARE_TYPE_LABELS,
  CARE_FORMATS,
  CARE_FORMAT_LABELS,
  US_STATES,
  type CareType,
  type CareFormatPreference,
} from "@noor/types";
import { apiFetch, ApiError } from "../../lib/api";
import { NoorLogo } from "../../components/NoorLogo";
import type { PatientProfile } from "../../lib/profile";

interface Me {
  roles: string[];
}

interface FormState {
  firstName: string;
  lastName: string;
  state: string;
  reasonForSeekingCare: string;
  careType: CareType | "";
  careFormatPreference: CareFormatPreference | "";
}

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  state: "",
  reasonForSeekingCare: "",
  careType: "",
  careFormatPreference: "",
};

const STEP_TITLES = ["Your name", "Where are you located?", "What brings you to Noor?", "Your care preferences"];

// Deterministic, non-clinical onboarding (product brief §6/M2): four short
// steps, saved incrementally via PATCH /patients/me so a refresh never
// loses progress, finished with POST /patients/me/onboarding/complete.
export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        const profile = await apiFetch<PatientProfile>("/patients/me");
        if (cancelled) return;
        if (profile.onboardingCompletedAt) {
          router.push("/home");
          return;
        }
        setForm({
          firstName: profile.firstName ?? "",
          lastName: profile.lastName ?? "",
          state: profile.state ?? "",
          reasonForSeekingCare: profile.reasonForSeekingCare ?? "",
          careType: profile.careType ?? "",
          careFormatPreference: profile.careFormatPreference ?? "",
        });
        setLoading(false);
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

  function stepPayload(): Record<string, string> {
    switch (step) {
      case 0:
        return { firstName: form.firstName.trim(), lastName: form.lastName.trim() };
      case 1:
        return { state: form.state };
      case 2:
        return { reasonForSeekingCare: form.reasonForSeekingCare.trim() };
      case 3:
        return { careType: form.careType, careFormatPreference: form.careFormatPreference };
      default:
        return {};
    }
  }

  function validateStep(): string | null {
    switch (step) {
      case 0:
        if (!form.firstName.trim() || !form.lastName.trim()) return "Please enter your first and last name.";
        return null;
      case 1:
        if (!form.state) return "Please choose your state.";
        return null;
      case 2:
        if (form.reasonForSeekingCare.trim().length < 3) return "Tell us a little more — a sentence is plenty.";
        return null;
      case 3:
        if (!form.careType) return "Please choose a care type.";
        if (!form.careFormatPreference) return "Please choose a care format.";
        return null;
      default:
        return null;
    }
  }

  async function onContinue() {
    const validationError = validateStep();
    if (validationError) {
      setStepError(validationError);
      return;
    }
    setStepError(null);
    setSubmitting(true);
    try {
      await apiFetch("/patients/me", { method: "PATCH", body: JSON.stringify(stepPayload()) });
      if (step === STEP_TITLES.length - 1) {
        await apiFetch("/patients/me/onboarding/complete", { method: "POST" });
        router.push("/home");
        return;
      }
      setStep((s) => s + 1);
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function onBack() {
    setStepError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  if (error) {
    return (
      <main className="noor-shell noor-center">
        <p className="noor-error">{error}</p>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="noor-shell noor-center">
        <p className="noor-muted">Loading...</p>
      </main>
    );
  }

  const progress = Math.round(((step + 1) / STEP_TITLES.length) * 100);

  return (
    <main className="noor-shell">
      <div className="noor-center">
        <NoorLogo />
      </div>
      <div className="noor-section">
        <span className="noor-step-label">
          Step {step + 1} of {STEP_TITLES.length}
        </span>
        <div className="noor-progress-track">
          <div className="noor-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="noor-card noor-section">
          <h2>{STEP_TITLES[step]}</h2>

          {stepError && <p className="noor-error">{stepError}</p>}

          {step === 0 && (
            <div className="noor-stack">
              <div className="noor-field">
                <label htmlFor="firstName">First name</label>
                <input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                />
              </div>
              <div className="noor-field">
                <label htmlFor="lastName">Last name</label>
                <input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="noor-field">
              <label htmlFor="state">State</label>
              <select id="state" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}>
                <option value="" disabled>
                  Choose your state
                </option>
                {US_STATES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
              <span className="noor-field-hint">
                Telehealth availability depends on where you&apos;re located.
              </span>
            </div>
          )}

          {step === 2 && (
            <div className="noor-field">
              <label htmlFor="reason">In a sentence or two, what brings you to Noor?</label>
              <textarea
                id="reason"
                value={form.reasonForSeekingCare}
                onChange={(e) => setForm((f) => ({ ...f, reasonForSeekingCare: e.target.value }))}
                placeholder="There's no wrong answer — this just helps us get you started."
              />
            </div>
          )}

          {step === 3 && (
            <div className="noor-stack">
              <div>
                <label style={{ display: "block", fontWeight: 500, marginBottom: "0.6rem" }}>
                  What kind of care are you looking for?
                </label>
                <div className="noor-radio-cards">
                  {CARE_TYPES.map((option) => (
                    <label className="noor-radio-card" key={option}>
                      <input
                        type="radio"
                        name="careType"
                        value={option}
                        checked={form.careType === option}
                        onChange={() => setForm((f) => ({ ...f, careType: option }))}
                      />
                      {CARE_TYPE_LABELS[option]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontWeight: 500, marginBottom: "0.6rem" }}>
                  How would you like to connect?
                </label>
                <div className="noor-radio-cards">
                  {CARE_FORMATS.map((option) => (
                    <label className="noor-radio-card" key={option}>
                      <input
                        type="radio"
                        name="careFormatPreference"
                        value={option}
                        checked={form.careFormatPreference === option}
                        onChange={() => setForm((f) => ({ ...f, careFormatPreference: option }))}
                      />
                      {CARE_FORMAT_LABELS[option]}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="noor-button-row">
            {step > 0 && (
              <button type="button" className="noor-button noor-button--secondary" onClick={onBack} disabled={submitting}>
                Back
              </button>
            )}
            <button type="button" className="noor-button" onClick={onContinue} disabled={submitting}>
              {submitting ? "Saving..." : step === STEP_TITLES.length - 1 ? "Finish" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
