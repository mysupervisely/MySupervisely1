import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";

export const metadata: Metadata = {
  title: "Log in — DosePrepped",
};

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your DosePrepped account."
    >
      <LoginForm />
      <p className="text-sm text-ink-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}
