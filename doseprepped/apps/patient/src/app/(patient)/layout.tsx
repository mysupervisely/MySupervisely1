import { Logo } from "@/components/Logo";
import { PageContainer } from "@/components/layout/PageContainer";
import { BottomNav } from "@/components/layout/BottomNav";
import { Badge } from "@/components/ui/Badge";

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <PageContainer className="flex h-14 items-center justify-between">
          <Logo />
          <Badge tone="neutral">Demo patient</Badge>
        </PageContainer>
      </header>
      <main className="flex-1 py-6">
        <PageContainer className="flex flex-col gap-6">{children}</PageContainer>
      </main>
      <BottomNav />
    </div>
  );
}
