import Svg, { Circle, Line } from "react-native-svg";

/**
 * The Noor sun mark, ported 1:1 (same 12 ray coordinates) from
 * apps/patient/src/components/NoorSunMark.tsx — see that file's comment
 * for the brand-sourcing note (an original interpretation; no real Noor
 * Therapy Group assets were ever available to this build) and the
 * hydration-mismatch reason the ray coordinates are fixed constants
 * rather than computed via Math.cos/Math.sin. That reason doesn't apply
 * on native (no server-render step), but keeping the exact same
 * constants keeps the mark visually identical to the web app rather than
 * a redrawn approximation — see docs/noor/M5-IMPLEMENTATION.md "App icon
 * / branding status" for why this hand-drawn mark, not a production
 * logo file, is also what the app icon integration point currently
 * points at.
 */
const RAYS = [
  { x1: 33.5, y1: 20.0, x2: 39.0, y2: 20.0 },
  { x1: 31.69, y1: 26.75, x2: 34.29, y2: 28.25 },
  { x1: 26.75, y1: 31.69, x2: 28.25, y2: 34.29 },
  { x1: 20.0, y1: 33.5, x2: 20.0, y2: 39.0 },
  { x1: 13.25, y1: 31.69, x2: 11.75, y2: 34.29 },
  { x1: 8.31, y1: 26.75, x2: 5.71, y2: 28.25 },
  { x1: 6.5, y1: 20.0, x2: 1.0, y2: 20.0 },
  { x1: 8.31, y1: 13.25, x2: 5.71, y2: 11.75 },
  { x1: 13.25, y1: 8.31, x2: 11.75, y2: 5.71 },
  { x1: 20.0, y1: 6.5, x2: 20.0, y2: 1.0 },
  { x1: 26.75, y1: 8.31, x2: 28.25, y2: 5.71 },
  { x1: 31.69, y1: 13.25, x2: 34.29, y2: 11.75 },
] as const;

export function NoorSunMark({ size = 32, color = "#b3823f" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" fill="none" accessibilityLabel="Noor" accessibilityRole="image">
      <Circle cx="20" cy="20" r="8.5" stroke={color} strokeWidth="1.6" />
      {RAYS.map((ray, i) => (
        <Line
          key={i}
          x1={ray.x1}
          y1={ray.y1}
          x2={ray.x2}
          y2={ray.y2}
          stroke={color}
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}
