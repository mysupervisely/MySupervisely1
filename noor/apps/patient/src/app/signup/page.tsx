"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "../../lib/api";
import { NoorLogo } from "../../components/NoorLogo";

export default function SignupPage() {
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
      await apiFetch("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password, app: "patient" }),
      });
      router.push("/onboarding");
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
        <div className="noor-center">
          <h1>Create your account</h1>
          <p className="noor-muted">
            We&apos;ll ask a few onboarding questions next — nothing clinical, just enough to get you
            started.
          </p>
        </div>
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
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span className="noor-field-hint">At least 10 characters, with a letter and a number.</span>
            </div>
            <button type="submit" className="noor-button noor-button--full" disabled={submitting}>
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>
        </div>
        <p className="noor-muted noor-center">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}
