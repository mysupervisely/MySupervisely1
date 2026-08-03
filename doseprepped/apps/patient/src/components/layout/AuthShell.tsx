import { Logo } from "@/components/Logo";
import { PageContainer } from "@/components/layout/PageContainer";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center py-12">
      <PageContainer className="flex max-w-sm flex-col items-center gap-6">
        <Logo />
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        </div>
        {children}
      </PageContainer>
    </main>
  );
}
