"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { API_URL } from "@/lib/api";

export function SignupForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors([]);

    if (password !== confirmPassword) {
      setErrors(["Passwords do not match."]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ firstName, lastName, email, password, confirmPassword }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const details: string[] | undefined = body?.details?.fieldErrors
          ? Object.values(body.details.fieldErrors).flat()
          : body?.details;
        setErrors(details?.length ? details : [body?.error ?? "Something went wrong. Please try again."]);
        return;
      }

      router.push("/home");
      router.refresh();
    } catch {
      setErrors(["Could not reach the server. Please try again."]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="flex w-full flex-col gap-4" onSubmit={handleSubmit}>
      <TextField
        id="firstName"
        label="First name"
        autoComplete="given-name"
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        required
      />
      <TextField
        id="lastName"
        label="Last name"
        autoComplete="family-name"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        required
      />
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
        autoComplete="new-password"
        placeholder="At least 10 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      <TextField
        id="confirmPassword"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        required
      />
      {errors.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-danger">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
      <Button type="submit" fullWidth disabled={loading}>
        {loading ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
