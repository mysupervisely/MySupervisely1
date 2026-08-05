import Link from "next/link";
import { Logo } from "@/components/Logo";
import { PageContainer } from "@/components/layout/PageContainer";
import { DemoBanner } from "@/components/demo/DemoBanner";

const NAV_LINKS = [
  { href: "/demo", label: "Overview" },
  { href: "/demo/patient", label: "Patient" },
  { href: "/demo/pharmacist", label: "Pharmacist" },
  { href: "/demo/admin", label: "Telehealth Admin" },
  { href: "/demo/journey", label: "Full Journey" },
];

/**
 * M6.0 — Demo Mode shell. Deliberately public (no requireRole/
 * requireOrganizationAdmin guard) — see
 * docs/doseprepped/ARCHITECTURE.md "M6.0 — Demo Mode authentication" for
 * why that's safe: every page under this layout only ever reads/writes
 * data as one of three dedicated, isolated Demo Mode accounts via the
 * real, unmodified API and its real authorization checks — a visitor's
 * own (nonexistent) identity is never elevated to any of them.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <PageContainer className="flex h-14 items-center justify-between gap-3">
          <Logo />
          <Link href="/" className="text-sm text-ink-muted hover:text-ink">
            Exit demo
          </Link>
        </PageContainer>
      </header>
      <nav className="border-b border-border bg-surface">
        <PageContainer className="flex flex-wrap gap-1 py-2">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-accent-light hover:text-ink"
            >
              {link.label}
            </Link>
          ))}
        </PageContainer>
      </nav>
      <main className="flex-1 py-6">
        <PageContainer className="flex flex-col gap-6">
          <DemoBanner />
          {children}
        </PageContainer>
      </main>
    </div>
  );
}
