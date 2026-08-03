import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/AuthShell";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";

export const metadata: Metadata = {
  title: "Log in — DosePrepped",
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your DosePrepped account."
    >
      <form className="flex w-full flex-col gap-4">
        <TextField id="email" label="Email" type="email" placeholder="you@example.com" disabled />
        <TextField id="password" label="Password" type="password" placeholder="••••••••" disabled />
        <Button type="submit" fullWidth disabled>
          Log in
        </Button>
      </form>
      <PlaceholderNotice>
        Authentication is not implemented yet. This screen is a structural
        placeholder for the M1 milestone.
      </PlaceholderNotice>
      <p className="text-sm text-ink-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
