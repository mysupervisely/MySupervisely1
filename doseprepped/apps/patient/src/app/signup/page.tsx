import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/AuthShell";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";

export const metadata: Metadata = {
  title: "Sign up — DosePrepped",
};

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Get started with DosePrepped in a few seconds."
    >
      <form className="flex w-full flex-col gap-4">
        <TextField id="name" label="Full name" placeholder="Jordan Rivera" disabled />
        <TextField id="email" label="Email" type="email" placeholder="you@example.com" disabled />
        <TextField id="password" label="Password" type="password" placeholder="••••••••" disabled />
        <label className="flex items-start gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="mt-0.5" disabled />
          I acknowledge the DosePrepped privacy notice and consent to use of
          this application.
        </label>
        <Button type="submit" fullWidth disabled>
          Create account
        </Button>
      </form>
      <PlaceholderNotice>
        Account creation is not implemented yet. This screen is a structural
        placeholder for the M1 milestone.
      </PlaceholderNotice>
      <p className="text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
