import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noor — Patient",
  description: "Noor patient platform (M1 foundations build — not for real patient use).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
