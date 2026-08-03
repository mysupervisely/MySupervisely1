import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/AuthShell";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata: Metadata = {
  title: "Sign up — DosePrepped",
};

export default function SignupPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Get started with DosePrepped in a few seconds."
    >
      <SignupForm />
      <p className="text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}
