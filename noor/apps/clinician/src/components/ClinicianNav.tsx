"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "../lib/api";

type NavSection = "home" | "patients" | "check-ins" | "account";

interface Me {
  email: string;
}

// Persistent primary navigation (M4 brief §1): Home / Patients /
// Check-Ins are real, functional destinations; Schedule and Resources are
// listed to anticipate where they'll go, but render as disabled, clearly
// "coming soon" items — never a clickable link to nothing (brief: "Do not
// create fake functionality for future sections"). Rendered by each
// authenticated page individually (this app has no shared server layout
// that already knows the session), so it stays visually persistent across
// navigations without introducing a stateful root layout.
export function ClinicianNav({ active }: { active: NavSection }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<Me>("/auth/me")
      .then((me) => {
        if (!cancelled) setEmail(me.email);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/login");
  }

  return (
    <nav className="noor-nav" aria-label="Primary">
      <div className="noor-nav-links">
        <Link href="/dashboard" className="noor-nav-link" aria-current={active === "home" ? "page" : undefined}>
          Home
        </Link>
        <Link href="/patients" className="noor-nav-link" aria-current={active === "patients" ? "page" : undefined}>
          Patients
        </Link>
        <Link href="/check-ins" className="noor-nav-link" aria-current={active === "check-ins" ? "page" : undefined}>
          Check-Ins
        </Link>
        <span className="noor-nav-link noor-nav-link--disabled" aria-disabled="true">
          Schedule <span className="noor-badge noor-badge--muted" style={{ marginLeft: "0.4rem" }}>Soon</span>
        </span>
        <span className="noor-nav-link noor-nav-link--disabled" aria-disabled="true">
          Resources <span className="noor-badge noor-badge--muted" style={{ marginLeft: "0.4rem" }}>Soon</span>
        </span>
        <Link href="/account" className="noor-nav-link" aria-current={active === "account" ? "page" : undefined}>
          Account
        </Link>
      </div>
      <div className="noor-nav-actions">
        {email && <span>{email}</span>}
        <button type="button" className="noor-link-button" onClick={logout}>
          Log out
        </button>
      </div>
    </nav>
  );
}
