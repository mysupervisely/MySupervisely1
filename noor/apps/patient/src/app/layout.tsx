import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans } from "next/font/google";
import "./globals.css";

// Elegant serif for display/headings + a clean, warm sans for body/UI —
// see docs/noor/M2-IMPLEMENTATION.md "Brand" for why these were chosen
// (no real Noor Therapy Group brand assets were available to reference).
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
  title: "Noor — Patient",
  description: "Noor patient platform (M2 build — not for real patient use).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
