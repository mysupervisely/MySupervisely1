import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/layout/PageContainer";

export function MarketingHeader() {
  return (
    <header className="border-b border-border bg-surface/80 backdrop-blur">
      <PageContainer className="flex h-16 items-center justify-between sm:max-w-5xl">
        <Logo />
        <nav className="flex items-center gap-2">
          <Button href="/login" variant="ghost" size="md">
            Log in
          </Button>
          <Button href="/signup" variant="primary" size="md">
            Sign up
          </Button>
        </nav>
      </PageContainer>
    </header>
  );
}
