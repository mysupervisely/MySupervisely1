import Link from "next/link";
import { NoorSunMark } from "./NoorSunMark";

export function NoorLogo({ href = "/", size = 28 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="noor-logo" aria-label="Noor home">
      <NoorSunMark size={size} className="noor-logo-mark" />
      <span className="noor-logo-word">Noor</span>
    </Link>
  );
}
