import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { requireRole } from "@/lib/require-role";

export default async function PharmacistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("PHARMACIST");

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <PageContainer className="flex h-14 items-center justify-between">
          <Logo />
          <div className="flex items-center gap-3">
            <Badge tone="neutral">
              {user.firstName} {user.lastName}
            </Badge>
            <LogoutButton />
          </div>
        </PageContainer>
      </header>
      <main className="flex-1 py-6">
        <PageContainer className="flex flex-col gap-6">{children}</PageContainer>
      </main>
    </div>
  );
}
