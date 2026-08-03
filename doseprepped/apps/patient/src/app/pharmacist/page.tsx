import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";
import { requireRole } from "@/lib/require-role";

export const metadata: Metadata = {
  title: "Pharmacist — DosePrepped",
};

export default async function PharmacistHomePage() {
  const user = await requireRole("PHARMACIST");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <PageContainer className="flex h-14 items-center justify-between">
          <Logo />
          <Badge tone="neutral">
            {user.firstName} {user.lastName}
          </Badge>
        </PageContainer>
      </header>
      <main className="flex-1 py-10">
        <PageContainer className="flex flex-col items-center gap-6 text-center">
          <h1 className="text-2xl font-semibold text-ink">DosePrepped Pharmacist</h1>
          <p className="text-ink-muted">
            Your pharmacist dashboard will appear here.
          </p>
          <PlaceholderNotice>
            Pharmacist request review and secure messaging are not
            implemented yet — reserved for a later milestone.
          </PlaceholderNotice>
          <LogoutButton />
        </PageContainer>
      </main>
    </div>
  );
}
