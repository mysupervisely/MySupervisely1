import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function PerspectiveCard({
  eyebrow,
  title,
  description,
  href,
  cta,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Card className="flex flex-col gap-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</span>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="text-sm text-ink-muted">{description}</p>
      <Button href={href} variant="secondary" className="mt-1 w-fit">
        {cta}
      </Button>
    </Card>
  );
}
