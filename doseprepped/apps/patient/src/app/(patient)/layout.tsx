import { Logo } from "@/components/Logo";
import { PageContainer } from "@/components/layout/PageContainer";
import { BottomNav } from "@/components/layout/BottomNav";
import { Badge } from "@/components/ui/Badge";
import { requireRole } from "@/lib/require-role";

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole("PATIENT");

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
      <main className="flex-1 py-6">
        <PageContainer className="flex flex-col gap-6">{children}</PageContainer>
      </main>
      <BottomNav />
    </div>
  );
}
