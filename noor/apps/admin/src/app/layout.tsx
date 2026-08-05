import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noor — Admin",
  description: "Noor admin dashboard (M1 foundations build — not for real production use).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
