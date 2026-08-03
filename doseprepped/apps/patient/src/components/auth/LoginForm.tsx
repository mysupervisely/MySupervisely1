"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { API_URL } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Land on /home; a pharmacist or admin account is redirected to its
      // own home server-side (see lib/require-role.ts) without a second
      // client round trip.
      router.push("/home");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="flex w-full flex-col gap-4" onSubmit={handleSubmit}>
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <TextField
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        placeholder="••••••••"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" fullWidth disabled={loading}>
        {loading ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
