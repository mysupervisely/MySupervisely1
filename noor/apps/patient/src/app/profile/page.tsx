"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { NoorLogo } from "../../components/NoorLogo";
import type { PatientProfile } from "../../lib/profile";

interface FormState {
  firstName: string;
  lastName: string;
  state: string;
  whatBringsYouToNoor: NoorInterest | "";
  careType: CareType | "";
  careFormatPreference: CareFormatPreference | "";
}

// Reuses the same PATCH /patients/me endpoint the onboarding wizard uses
// (docs/noor/M2-IMPLEMENTATION.md) — this is the "patient profile" surface
// named explicitly in the M2 product objective (onboarding -> patient
// profile -> Noor Home), available any time after onboarding, not just
// during it. Only first name, last name, state, and care preferences are
// editable here — there is no field for user ID, role, audit info, care
// relationship identifiers, or system timestamps; those simply aren't
// part of this form or the API schema it submits to (see
// packages/types/src/onboarding.ts's patientProfileUpdateSchema), so
// there's no protected field a patient could even attempt to change.
export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const profile = await apiFetch<PatientProfile>("/patients/me");
        if (cancelled) return;
        if (!profile.onboardingCompletedAt) {
          router.push("/onboarding");
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

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaveError(null);
    setSaved(false);
    setSaving(true);
    try {
      await apiFetch("/patients/me", { method: "PATCH", body: JSON.stringify(form) });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
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

  if (loading || !form) {
    return (
      <main className="noor-shell noor-center">
        <p className="noor-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="noor-shell">
      <NoorLogo />
      <div className="noor-section">
        <Link href="/home" className="noor-muted">
          ← Back to Home
        </Link>
        <h1 className="noor-section">Your profile</h1>
        <div className="noor-card">
          <form onSubmit={onSave}>
            {saveError && (
              <p className="noor-error" role="alert">
                {saveError}
              </p>
            )}
            {saved && (
              <p className="noor-badge" role="status" style={{ marginBottom: "1rem" }}>
                Saved
              </p>
            )}
            <div className="noor-field">
              <label htmlFor="firstName">First name</label>
              <input
                id="firstName"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                autoComplete="given-name"
              />
            </div>
            <div className="noor-field">
              <label htmlFor="lastName">Last name</label>
              <input
                id="lastName"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                autoComplete="family-name"
              />
            </div>
            <div className="noor-field">
              <label htmlFor="state">State</label>
              <select
                id="state"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                autoComplete="address-level1"
              >
                {US_STATES.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="noor-field">
              <label htmlFor="whatBringsYouToNoor">What brings you to Noor?</label>
              <select
                id="whatBringsYouToNoor"
                value={form.whatBringsYouToNoor}
                onChange={(e) => setForm({ ...form, whatBringsYouToNoor: e.target.value as NoorInterest })}
              >
                {NOOR_INTERESTS.map((option) => (
                  <option key={option} value={option}>
                    {NOOR_INTEREST_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <div className="noor-field">
              <label htmlFor="careType">Care type</label>
              <select
                id="careType"
                value={form.careType}
                onChange={(e) => setForm({ ...form, careType: e.target.value as CareType })}
              >
                {CARE_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {CARE_TYPE_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <div className="noor-field">
              <label htmlFor="careFormat">Care format</label>
              <select
                id="careFormat"
                value={form.careFormatPreference}
                onChange={(e) => setForm({ ...form, careFormatPreference: e.target.value as CareFormatPreference })}
              >
                {CARE_FORMATS.map((option) => (
                  <option key={option} value={option}>
                    {CARE_FORMAT_LABELS[option]}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="noor-button" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
