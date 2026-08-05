"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "../../lib/api";

interface Me {
  email: string;
  roles: string[];
}

interface PatientProfile {
  firstName: string | null;
  lastName: string | null;
}

// This page is client-rendered and fetches its own data from the API on
// mount — it never queries a database directly (M1 requirement #1/#2).
// Authorization is enforced by the API on every call, not by anything
// this component does; a client-side redirect here is a UX convenience,
// not a security boundary. See docs/noor/M1-IMPLEMENTATION.md "Known
// limitations" for why the frontends are client-rendered in M1.
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
        if (!cancelled) setProfile(profileResult);
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

  if (!me) {
    return (
      <main className="noor-shell">
        <p className="noor-muted">Loading...</p>
      </main>
    );
  }

  const displayName = profile?.firstName ?? me.email;

  return (
    <main className="noor-shell">
      <h1>Good to see you, {displayName}.</h1>
      <div className="noor-card">
        <p>
          <strong>Care status:</strong> not yet in active care — the weekly check-in and provider
          matching aren&apos;t built yet (see the M0 roadmap, M3/M5).
        </p>
        <p>
          <strong>Next check-in:</strong> not available yet.
        </p>
        <p>
          <strong>Subscription:</strong> no active subscription.
        </p>
      </div>
      <p>
        <button className="noor-button" onClick={logout}>
          Log out
        </button>
      </p>
    </main>
  );
}
