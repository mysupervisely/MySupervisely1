"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "../../lib/api";
import { ClinicianNav } from "../../components/ClinicianNav";

interface Me {
  email: string;
  roles: string[];
}

interface ClinicianProfile {
  displayName: string;
  credentialsDisplay: string | null;
  bio: string | null;
}

// A real, minimal account page — not a placeholder for functionality that
// doesn't exist yet (M4 brief §1: "Do not create fake functionality for
// future sections"). Shows the clinician's own profile (GET
// /clinicians/me, unchanged from M1); editing isn't in scope for M4.
export default function ClinicianAccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<ClinicianProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const meResult = await apiFetch<Me>("/auth/me");
        if (cancelled) return;
        if (!meResult.roles.includes("CLINICIAN")) {
          setError("This account is not a clinician account.");
          return;
        }
        setMe(meResult);
        const profileResult = await apiFetch<ClinicianProfile>("/clinicians/me");
        if (cancelled) return;
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
      <div className="noor-page">
        <ClinicianNav active="account" />
        <main className="noor-shell">
          <p className="noor-muted">Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="noor-page">
      <ClinicianNav active="account" />
      <main className="noor-shell noor-shell--narrow">
        <h1>Account</h1>
        <div className="noor-card">
          <p style={{ marginBottom: "0.4rem" }}>
            <strong>Name:</strong> {profile.displayName}
          </p>
          {profile.credentialsDisplay && (
            <p style={{ marginBottom: "0.4rem" }}>
              <strong>Credentials:</strong> {profile.credentialsDisplay}
            </p>
          )}
          <p style={{ marginBottom: 0 }}>
            <strong>Email:</strong> {me.email}
          </p>
        </div>
      </main>
    </div>
  );
}
