"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "../../lib/api";

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
      router.push("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="noor-shell">
      <h1>Create your account</h1>
      <p className="noor-muted">
        Onboarding (your name, general reason for care, and preferences) isn&apos;t built yet — that&apos;s the
        next milestone. This just creates your account.
      </p>
      <div className="noor-card">
        <form onSubmit={onSubmit}>
          {error && <p className="noor-error">{error}</p>}
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
            <span className="noor-muted">At least 10 characters, with a letter and a number.</span>
          </div>
          <button type="submit" className="noor-button" disabled={submitting}>
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>
      </div>
      <p className="noor-muted">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
