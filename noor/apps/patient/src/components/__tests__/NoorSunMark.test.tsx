import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NoorSunMark } from "../NoorSunMark";

// Regression test for a real hydration-mismatch bug caught during M2
// manual/browser verification: the sun mark's ray coordinates must be
// fixed constants, not computed via Math.cos/Math.sin at render time,
// because trig results can differ by a floating-point ULP between Node's
// SSR pass and the browser's hydration pass, which React reports as a
// hydration mismatch. Rendering the same component twice (simulating
// "server" and "client" passes) must produce byte-identical markup.
describe("NoorSunMark", () => {
  it("renders the same markup on repeated renders (no per-render floating-point drift)", () => {
    const first = renderToStaticMarkup(<NoorSunMark />);
    const second = renderToStaticMarkup(<NoorSunMark />);
    expect(first).toBe(second);
  });

  it("renders exactly 12 rays plus the center ring", () => {
    const markup = renderToStaticMarkup(<NoorSunMark />);
    expect((markup.match(/<line/g) ?? []).length).toBe(12);
    expect((markup.match(/<circle/g) ?? []).length).toBe(1);
  });

  it("never emits a numeric attribute with more than 2 decimal places", () => {
    const markup = renderToStaticMarkup(<NoorSunMark />);
    const numbers = markup.match(/-?\d+\.\d+/g) ?? [];
    for (const n of numbers) {
      const decimals = n.split(".")[1] ?? "";
      expect(decimals.length).toBeLessThanOrEqual(2);
    }
  });
});
