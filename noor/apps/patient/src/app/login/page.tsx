"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "../../lib/api";
import { NoorLogo } from "../../components/NoorLogo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, app: "patient" }),
      });
      // /home itself checks onboarding completion and redirects to
      // /onboarding when needed — one place owns that decision.
      router.push("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="noor-shell noor-center">
      <NoorLogo />
      <div className="noor-section noor-stack" style={{ textAlign: "left" }}>
        <h1 className="noor-center">Welcome back</h1>
        <div className="noor-card">
          <form onSubmit={onSubmit}>
            {error && <p className="noor-error" role="alert">{error}</p>}
            <div className="noor-field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="noor-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="noor-button noor-button--full" disabled={submitting}>
              {submitting ? "Logging in..." : "Log in"}
            </button>
          </form>
        </div>
        <p className="noor-muted noor-center">
          No account? <Link href="/signup">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
