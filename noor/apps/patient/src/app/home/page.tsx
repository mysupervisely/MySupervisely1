"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "../../lib/api";
import { NoorLogo } from "../../components/NoorLogo";
import { timeOfDayGreeting, type PatientProfile } from "../../lib/profile";

interface Me {
  email: string;
  roles: string[];
}

// The calm, premium Noor Home dashboard — the patient's central Noor hub
// (M2 brief §6). Every section below is either real data from the API
// (greeting, profile status) or an honest, clearly-labeled future/empty
// state — nothing here is fabricated clinical, scheduling, or provider
// data. Notably absent: any named "Noor Async" product entry point —
// Noor's primary product is live therapy, and whether structured
// between-session care ships as a bundled feature or a separate product
// is an open decision (see docs/noor/M2-IMPLEMENTATION.md "Product
// direction: Async"), so this page never brands or prices it. This page
// is client-rendered and fetches its own data; the API enforces every
// authorization decision regardless of what renders here (see
// docs/noor/M1-IMPLEMENTATION.md "Known limitations").
export default function HomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const meResult = await apiFetch<Me>("/auth/me");
        if (cancelled) return;
        if (!meResult.roles.includes("PATIENT")) {
          setError("This account is not a patient account.");
          return;
        }
        setMe(meResult);
        const profileResult = await apiFetch<PatientProfile>("/patients/me");
        if (cancelled) return;
        if (!profileResult.onboardingCompletedAt) {
          router.push("/onboarding");
          return;
        }
        setProfile(profileResult);
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

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
  }

  if (error) {
    return (
      <main className="noor-shell">
        <p className="noor-error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (!me || !profile) {
    return (
      <main className="noor-shell">
        <p className="noor-muted">Loading...</p>
      </main>
    );
  }

  const displayName = profile.firstName ?? me.email;

  return (
    <div className="noor-page">
      <header className="noor-header">
        <NoorLogo />
        <div className="noor-header-actions">
          <span className="noor-header-email">{me.email}</span>
          <button type="button" className="noor-link-button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <main className="noor-shell noor-shell--wide">
        <h1>
          {timeOfDayGreeting()}, {displayName}.
        </h1>
        <p className="noor-muted">A brighter path forward.</p>
        <p className="noor-muted" style={{ fontSize: "0.9rem" }}>
          {profile.completionPercent === 100 ? "Your profile is complete." : "A few profile details are still missing."}{" "}
          <Link href="/profile">Edit your info →</Link>
        </p>

        <section className="noor-section" aria-labelledby="your-care-heading">
          <h2 id="your-care-heading">Your care</h2>
          <div className="noor-card">
            <h3 style={{ fontFamily: "var(--ff-display)", fontSize: "1.15rem" }}>No provider yet</h3>
            <p className="noor-muted">Find a therapist who fits your needs.</p>
            <Link href="/find-a-therapist" className="noor-button">
              Find a Therapist
            </Link>
            <p className="noor-muted" style={{ fontSize: "0.85rem", marginTop: "1rem", marginBottom: 0 }}>
              No upcoming appointments yet. Once you&apos;re matched with a provider, they&apos;ll show up here.
            </p>
          </div>
        </section>

        <section className="noor-section" aria-labelledby="your-journey-heading">
          <h2 id="your-journey-heading">Your Noor journey</h2>
          <div className="noor-card noor-card--muted">
            <h3 style={{ fontFamily: "var(--ff-display)", fontSize: "1.1rem" }}>How are things going?</h3>
            <p className="noor-muted" style={{ marginBottom: "1rem" }}>
              Take a few minutes to check in with how you&apos;ve been doing.
            </p>
            <Link href="/check-in" className="noor-button">
              Begin Check-In
            </Link>
            <p className="noor-muted" style={{ fontSize: "0.85rem", marginTop: "1rem", marginBottom: 0 }}>
              <Link href="/check-in/history">View your check-in history →</Link>
            </p>
          </div>
        </section>

        <section className="noor-section" aria-labelledby="explore-care-heading">
          <h2 id="explore-care-heading">Explore care</h2>
          <div className="noor-card-grid">
            <div className="noor-card">
              <h3 style={{ fontFamily: "var(--ff-display)", fontSize: "1.1rem" }}>Therapy</h3>
              <p className="noor-muted">Connect with a therapist who fits your needs.</p>
              <Link href="/find-a-therapist" className="noor-button noor-button--secondary">
                Explore Therapy
              </Link>
            </div>
            <div className="noor-card noor-card--muted">
              <div className="noor-entry-card-head">
                <h3 style={{ fontFamily: "var(--ff-display)", fontSize: "1.1rem", margin: 0 }}>Psychiatry</h3>
                <span className="noor-badge noor-badge--muted">Coming soon</span>
              </div>
              <p className="noor-muted" style={{ margin: 0 }}>
                Psychiatric care may be available as Noor expands.
              </p>
            </div>
          </div>
        </section>

        <section className="noor-section" aria-labelledby="resources-heading">
          <h2 id="resources-heading">Resources</h2>
          <div className="noor-card">
            <p className="noor-muted" style={{ marginBottom: "1rem" }}>
              Tools and information to support your mental health.
            </p>
            <Link href="/resources" className="noor-button noor-button--secondary">
              Explore Resources
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
