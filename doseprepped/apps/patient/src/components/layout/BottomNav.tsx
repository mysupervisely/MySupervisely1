"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Pill, MessageCircleQuestion, Stethoscope, UserRound } from "lucide-react";
import { cn } from "@/lib/cn";

const items = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/medications", label: "Medications", icon: Pill },
  { href: "/ask-a-question", label: "Ask", icon: MessageCircleQuestion },
  { href: "/ask-a-pharmacist", label: "Pharmacist", icon: Stethoscope },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="sticky bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur"
    >
      <ul className="mx-auto flex max-w-md justify-between px-2 py-1.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                  active ? "text-primary" : "text-ink-muted hover:text-primary",
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
