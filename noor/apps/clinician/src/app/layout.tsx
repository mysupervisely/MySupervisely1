import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noor — Clinician",
  description: "Noor clinician dashboard (M1 foundations build — not for real clinical use).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
