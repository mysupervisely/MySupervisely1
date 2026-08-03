import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Medication } from "@/lib/medications";

export function MedicationCard({ medication }: { medication: Medication }) {
  const isActive = medication.status === "ACTIVE";

  return (
    <Link href={`/medications/${medication.id}`} className="block">
      <Card className="flex flex-col gap-1 transition-colors hover:border-primary/40">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold text-ink">{medication.name}</h3>
          <Badge tone={isActive ? "info" : "neutral"}>
            {isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        <p className="text-sm text-ink-muted">{medication.strength}</p>
        <p className="text-sm text-ink">{medication.directions}</p>
      </Card>
    </Link>
  );
}
