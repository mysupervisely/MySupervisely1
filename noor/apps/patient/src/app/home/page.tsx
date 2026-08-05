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

// The calm, premium Noor Home dashboard (M2 brief §"PATIENT HOME"). Every
// section below is either real data from the API (greeting, profile
// status) or an honest, clearly-labeled future/empty state — nothing here
// is fabricated clinical or scheduling data. This page is client-rendered
// and fetches its own data; the API enforces every authorization decision
// regardless of what renders here (see docs/noor/M1-IMPLEMENTATION.md
// "Known limitations").
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
        <p className="noor-error">{error}</p>
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
        <p className="noor-muted">Here&apos;s where things stand today.</p>

        <div className="noor-section noor-card-grid">
          <div className="noor-card">
            <div className="noor-entry-card-head">
              <h3 style={{ fontFamily: "var(--ff-display)", fontSize: "1.15rem" }}>Your profile</h3>
              <span className="noor-badge">{profile.completionPercent === 100 ? "Complete" : `${profile.completionPercent}%`}</span>
            </div>
            <p className="noor-muted">
              {profile.completionPercent === 100
                ? "You're all set up."
                : "A few details are still missing."}
            </p>
            <Link href="/profile">Edit your info →</Link>
          </div>

          <div className="noor-card">
            <h3 style={{ fontFamily: "var(--ff-display)", fontSize: "1.15rem" }}>Subscription</h3>
            <p className="noor-muted">No active subscription.</p>
            <Link href="/async-care">Learn about Noor Async →</Link>
          </div>
        </div>

        <div className="noor-section">
          <h2>Find your way</h2>
          <div className="noor-card-grid">
            <Link href="/find-a-therapist" className="noor-entry-card">
              <div className="noor-entry-card-head">
                <h3>Find a therapist</h3>
                <span className="noor-badge noor-badge--muted">Coming soon</span>
              </div>
              <p>Browse providers by specialty, language, and availability.</p>
            </Link>

            <Link href="/async-care" className="noor-entry-card">
              <div className="noor-entry-card-head">
                <h3>Noor Async</h3>
                <span className="noor-badge noor-badge--muted">Coming soon</span>
              </div>
              <p>Ongoing, asynchronous support between sessions.</p>
            </Link>
          </div>
        </div>

        <div className="noor-section">
          <h2>Upcoming care</h2>
          <div className="noor-card noor-card--muted">
            <p className="noor-muted" style={{ margin: 0 }}>
              No upcoming appointments yet. Once you&apos;re matched with a provider, they&apos;ll show
              up here.
            </p>
          </div>
        </div>

        <div className="noor-section noor-card-grid">
          <div className="noor-card noor-card--muted">
            <h3 style={{ fontFamily: "var(--ff-display)", fontSize: "1.1rem" }}>Weekly check-in</h3>
            <p className="noor-muted" style={{ margin: 0 }}>
              Your first check-in will appear here once your care begins.
            </p>
          </div>
          <div className="noor-card noor-card--muted">
            <h3 style={{ fontFamily: "var(--ff-display)", fontSize: "1.1rem" }}>Noor resources</h3>
            <p className="noor-muted" style={{ margin: 0 }}>
              Articles and guides are on their way.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
