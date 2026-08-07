/**
 * M9 — the real PharmDPrepped pricing formula, ported verbatim from
 * `mobile-source/web-reference/index.html` (confirmed against
 * `docs/MOBILE_PAYMENT_ARCHITECTURE.md` §4). Pure, framework-agnostic,
 * same "reuse the exact formula, not a guessed one" discipline as
 * M8's `aiQuestionService.ts` reusing the real prompt contract.
 *
 * `Price(days, plan) = PRICE_BASES[plan] * days ^ PRICE_EXPONENT` — a
 * diminishing per-day cost as the access window grows. Every number a
 * screen displays is computed here; nothing is hardcoded in the paywall.
 */

export type PricingPlan = 'course' | 'qbank' | 'bundle';

export const pricingConfig = {
  PRICE_BASES: { course: 39, qbank: 25, bundle: 52 } as Record<PricingPlan, number>,
  PRICE_EXPONENT: 0.425,
  MIN_DAYS: 3,
  MAX_DAYS: 365,
  DEFAULT_DAYS: 30,
} as const;

/** Clamps and rounds a requested day count to the real [3, 365] window the pricing model supports. */
export function clampDays(days: number): number {
  return Math.max(pricingConfig.MIN_DAYS, Math.min(pricingConfig.MAX_DAYS, Math.round(days)));
}

/** Raw (unrounded) price — callers display `Math.round(calcPrice(...))`, matching the web calculator's own split between exact math and display rounding. */
export function calcPrice(days: number, plan: PricingPlan): number {
  return pricingConfig.PRICE_BASES[plan] * Math.pow(days, pricingConfig.PRICE_EXPONENT);
}

/** Rounded per-day price — the calculator's own "$X / day" line. */
export function calcPricePerDay(days: number, plan: PricingPlan): number {
  return Math.round(calcPrice(days, plan) / days);
}

/**
 * Savings from buying the bundle instead of Course + QBank separately, at
 * the same day count. Never negative — clamped to 0 the same way the web
 * calculator clamps it, so a pricing-base misconfiguration could never
 * display a bundle as *more* expensive than "savings."
 */
export function calcBundleSavings(days: number): number {
  const separate = calcPrice(days, 'course') + calcPrice(days, 'qbank');
  const bundle = calcPrice(days, 'bundle');
  return Math.max(0, Math.round(separate - bundle));
}

export type PlanFeatures = {
  plan: PricingPlan;
  includesLessons: boolean;
  includesQbank: boolean;
  includesExams: boolean;
};

/**
 * `includesExams = includesQbank` — exams ship with QBank access, not
 * Course access, confirmed against the real FAQ copy (audit / payment
 * architecture doc §4). Used by the paywall to render feature bullets
 * without hardcoding which plan includes what.
 */
export function planFeatures(plan: PricingPlan): PlanFeatures {
  const includesLessons = plan === 'course' || plan === 'bundle';
  const includesQbank = plan === 'qbank' || plan === 'bundle';
  return { plan, includesLessons, includesQbank, includesExams: includesQbank };
}
