/**
 * The Noor sun mark — the primary brand symbol (M2 brand brief: "The Noor
 * sun symbol is the primary brand mark and should be incorporated into the
 * application"). No real Noor Therapy Group brand assets were available to
 * this build (noortherapygroup.com was not reachable and no screenshot was
 * attached to the conversation — see docs/noor/M2-IMPLEMENTATION.md "Brand
 * sourcing note"), so this is an original, restrained interpretation: a
 * thin ring with radiating strokes, drawn in the warm gold accent —
 * editorial rather than literal/cartoonish, matching the "calm, premium"
 * design brief rather than a generic sun-clipart wellness icon.
 *
 * The 12 ray coordinates are precomputed constants, not `Math.cos`/`Math.sin`
 * calls at render time — computing them at render caused a real,
 * caught-in-manual-verification hydration mismatch (server-rendered
 * "8.30865704891008" vs. client-computed 8.308657048910081 — a one-ULP
 * floating-point difference between Node's and the browser's trig
 * implementations). Fixed, rounded constants render byte-identical HTML on
 * both sides.
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

export function NoorSunMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      role="img"
      aria-label="Noor"
    >
      <circle cx="20" cy="20" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      {RAYS.map((ray, i) => (
        <line
          key={i}
          x1={ray.x1}
          y1={ray.y1}
          x2={ray.x2}
          y2={ray.y2}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}
