import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";

// Same brand fonts as apps/patient — see docs/noor/M2-IMPLEMENTATION.md
// "Brand." The clinician app is a separate origin/app (M1), but shares the
// same visual identity per M4 brief §23: "Maintain Noor branding."
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--ff-display",
  display: "swap",
});

const body = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--ff-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Noor — Clinician",
  description: "Noor clinician dashboard (M4 build — not for real clinical use).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
