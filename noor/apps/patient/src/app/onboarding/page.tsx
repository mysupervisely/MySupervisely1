"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  NOOR_INTERESTS,
  NOOR_INTEREST_LABELS,
  CARE_TYPES,
  CARE_TYPE_LABELS,
  CARE_FORMATS,
  CARE_FORMAT_LABELS,
  US_STATES,
  type NoorInterest,
  type CareType,
  type CareFormatPreference,
} from "@noor/types";
import { apiFetch, ApiError } from "../../lib/api";
import { NoorSunMark } from "../../components/NoorSunMark";
import { NoorLogo } from "../../components/NoorLogo";
import type { PatientProfile } from "../../lib/profile";

interface Me {
  roles: string[];
}

interface FormState {
  firstName: string;
  lastName: string;
  state: string;
  whatBringsYouToNoor: NoorInterest | "";
  careType: CareType | "";
  careFormatPreference: CareFormatPreference | "";
}

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  state: "",
  whatBringsYouToNoor: "",
  careType: "",
  careFormatPreference: "",
};

// Screen indices: 0 = welcome, 1-4 = the four data-collecting screens,
// 5 = completion. Only 1-4 show a "Step N of 4" progress indicator and
// only they call PATCH /patients/me — 0 and 5 are pure framing screens
// with no fields, per the M2 brief's 6-screen conversational example.
const WELCOME_STEP = 0;
const FIRST_DATA_STEP = 1;
const LAST_DATA_STEP = 4;
const COMPLETION_STEP = 5;

const DATA_STEP_TITLES: Record<number, string> = {
  1: "Let's get to know you.",
  2: "What brings you to Noor?",
  3: "What kind of care are you looking for?",
  4: "How would you like to receive care?",
};

function isProfileUntouched(profile: PatientProfile): boolean {
  return (
    !profile.firstName &&
    !profile.lastName &&
    !profile.state &&
    !profile.whatBringsYouToNoor &&
    !profile.careType &&
    !profile.careFormatPreference
  );
}

/** The first data step (1-4) that still needs an answer, given a profile
 * that already has some onboarding progress saved — this is the "resume"
 * behavior: a returning patient is dropped back where they left off,
 * never made to re-answer what they already saved. */
function firstIncompleteDataStep(profile: PatientProfile): number {
  if (!profile.firstName || !profile.lastName || !profile.state) return 1;
  if (!profile.whatBringsYouToNoor) return 2;
  if (!profile.careType) return 3;
  if (!profile.careFormatPreference) return 4;
  return COMPLETION_STEP;
}

// Deterministic, non-clinical onboarding (product brief §3/§4): a short
// conversational flow — welcome, then four data steps saved incrementally
// via PATCH /patients/me (so a refresh or a closed tab never loses
// progress), then a completion screen — finished with
// POST /patients/me/onboarding/complete.
export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(WELCOME_STEP);
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
          whatBringsYouToNoor: profile.whatBringsYouToNoor ?? "",
          careType: profile.careType ?? "",
          careFormatPreference: profile.careFormatPreference ?? "",
        });
        // Resume: a returning patient with any saved progress is dropped
        // at their first incomplete step, not sent back to the welcome
        // screen. A completely fresh account sees the welcome screen.
        setStep(isProfileUntouched(profile) ? WELCOME_STEP : firstIncompleteDataStep(profile));
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
      case 1:
        return { firstName: form.firstName.trim(), lastName: form.lastName.trim(), state: form.state };
      case 2:
        return { whatBringsYouToNoor: form.whatBringsYouToNoor };
      case 3:
        return { careType: form.careType };
      case 4:
        return { careFormatPreference: form.careFormatPreference };
      default:
        return {};
    }
  }

  function validateStep(): string | null {
    switch (step) {
      case 1:
        if (!form.firstName.trim() || !form.lastName.trim()) return "Please enter your first and last name.";
        if (!form.state) return "Please choose your state.";
        return null;
      case 2:
        if (!form.whatBringsYouToNoor) return "Please choose an option.";
        return null;
      case 3:
        if (!form.careType) return "Please choose a care type.";
        return null;
      case 4:
        if (!form.careFormatPreference) return "Please choose how you'd like to receive care.";
        return null;
      default:
        return null;
    }
  }

  async function onContinue() {
    // Welcome screen has nothing to save — just advance.
    if (step === WELCOME_STEP) {
      setStep(FIRST_DATA_STEP);
      return;
    }

    const validationError = validateStep();
    if (validationError) {
      setStepError(validationError);
      return;
    }
    setStepError(null);
    setSubmitting(true);
    try {
      await apiFetch("/patients/me", { method: "PATCH", body: JSON.stringify(stepPayload()) });
      if (step === LAST_DATA_STEP) {
        await apiFetch("/patients/me/onboarding/complete", { method: "POST" });
        setStep(COMPLETION_STEP);
      } else {
        setStep((s) => s + 1);
      }
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function onBack() {
    setStepError(null);
    setStep((s) => Math.max(WELCOME_STEP, s - 1));
  }

  function onFinish() {
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

  if (loading) {
    return (
      <main className="noor-shell noor-center">
        <p className="noor-muted">Loading...</p>
      </main>
    );
  }

  // --- Screen 1: Welcome ---
  if (step === WELCOME_STEP) {
    return (
      <main className="noor-shell noor-center">
        <div className="noor-hero" style={{ padding: "1.5rem 0" }}>
          <NoorSunMark size={44} className="noor-hero-mark" />
          <h1>Welcome to Noor.</h1>
          <p className="noor-muted">A brighter path forward.</p>
        </div>
        <button type="button" className="noor-button" onClick={onContinue} autoFocus>
          Continue
        </button>
      </main>
    );
  }

  // --- Screen 6: Completion ---
  if (step === COMPLETION_STEP) {
    return (
      <main className="noor-shell noor-center">
        <div className="noor-hero" style={{ padding: "1.5rem 0" }}>
          <NoorSunMark size={44} className="noor-hero-mark" />
          <h1>You&apos;re all set.</h1>
          <p className="noor-muted">Your Noor journey starts here.</p>
        </div>
        <button type="button" className="noor-button" onClick={onFinish} autoFocus>
          Continue to Noor Home
        </button>
      </main>
    );
  }

  // --- Screens 2-5: the four data steps ---
  const progress = Math.round(((step - FIRST_DATA_STEP + 1) / (LAST_DATA_STEP - FIRST_DATA_STEP + 1)) * 100);

  return (
    <main className="noor-shell">
      <div className="noor-center">
        <NoorLogo />
      </div>
      <div className="noor-section">
        <span className="noor-step-label">
          Step {step - FIRST_DATA_STEP + 1} of {LAST_DATA_STEP - FIRST_DATA_STEP + 1}
        </span>
        <div className="noor-progress-track" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="noor-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="noor-card noor-section">
          <h2>{DATA_STEP_TITLES[step]}</h2>

          {stepError && (
            <p className="noor-error" role="alert">
              {stepError}
            </p>
          )}

          {step === 1 && (
            <div className="noor-stack">
              <div className="noor-field">
                <label htmlFor="firstName">What should we call you? First name</label>
                <input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  autoComplete="given-name"
                />
              </div>
              <div className="noor-field">
                <label htmlFor="lastName">Last name</label>
                <input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  autoComplete="family-name"
                />
              </div>
              <div className="noor-field">
                <label htmlFor="state">State</label>
                <select
                  id="state"
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  autoComplete="address-level1"
                >
                  <option value="" disabled>
                    Choose your state
                  </option>
                  {US_STATES.map(([code, name]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
                <span className="noor-field-hint">Telehealth availability depends on where you&apos;re located.</span>
              </div>
            </div>
          )}

          {step === 2 && (
            <fieldset className="noor-fieldset">
              <legend className="noor-legend">What brings you to Noor?</legend>
              <div className="noor-radio-cards">
                {NOOR_INTERESTS.map((option) => (
                  <label className="noor-radio-card" key={option}>
                    <input
                      type="radio"
                      name="whatBringsYouToNoor"
                      value={option}
                      checked={form.whatBringsYouToNoor === option}
                      onChange={() => setForm((f) => ({ ...f, whatBringsYouToNoor: option }))}
                    />
                    {NOOR_INTEREST_LABELS[option]}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {step === 3 && (
            <fieldset className="noor-fieldset">
              <legend className="noor-legend">What kind of care are you looking for?</legend>
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
            </fieldset>
          )}

          {step === 4 && (
            <fieldset className="noor-fieldset">
              <legend className="noor-legend">How would you like to receive care?</legend>
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
            </fieldset>
          )}

          <div className="noor-button-row">
            <button type="button" className="noor-button noor-button--secondary" onClick={onBack} disabled={submitting}>
              Back
            </button>
            <button type="button" className="noor-button" onClick={onContinue} disabled={submitting}>
              {submitting ? "Saving..." : step === LAST_DATA_STEP ? "Finish" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
