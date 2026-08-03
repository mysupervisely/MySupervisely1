import Link from "next/link";
import { cn } from "@/lib/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "font-display text-lg font-semibold tracking-tight text-primary-dark",
        className,
      )}
    >
      Dose<span className="text-primary">Prepped</span>
    </Link>
  );
}
