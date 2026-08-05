import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { requireOrganizationAdmin } from "@/lib/require-org-admin";

const NAV_LINKS = [
  { href: "/org-admin", label: "Overview" },
  { href: "/org-admin/analytics", label: "Analytics" },
  { href: "/org-admin/members", label: "Members" },
  { href: "/org-admin/settings", label: "Settings" },
];

/**
 * Route group guard + shell for the organization-admin experience
 * (M5.5). The organization's own name is rendered prominently here —
 * the one place tenant context is made obvious, per
 * docs/doseprepped/ARCHITECTURE.md "M5.5 — UI screens" — and nothing
 * else in this screen tree ever fetches or renders another
 * organization's data, because every call below is scoped to the single
 * `organizationId` `requireOrganizationAdmin()` resolved server-side.
 */
export default async function OrgAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, organizationName } = await requireOrganizationAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <PageContainer className="flex h-14 items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Logo />
            <Badge tone="info">{organizationName}</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="neutral">
              {user.firstName} {user.lastName}
            </Badge>
            <LogoutButton />
          </div>
        </PageContainer>
      </header>
      <nav className="border-b border-border bg-surface">
        <PageContainer className="flex gap-1 py-2">
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
        <PageContainer className="flex flex-col gap-6">{children}</PageContainer>
      </main>
    </div>
  );
}
