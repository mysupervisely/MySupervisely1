import {
  calcBundleSavings,
  calcPrice,
  calcPricePerDay,
  clampDays,
  planFeatures,
  pricingConfig,
} from './pricingService';

describe('clampDays', () => {
  test('clamps below MIN_DAYS up to MIN_DAYS', () => {
    expect(clampDays(0)).toBe(pricingConfig.MIN_DAYS);
    expect(clampDays(-10)).toBe(pricingConfig.MIN_DAYS);
  });

  test('clamps above MAX_DAYS down to MAX_DAYS', () => {
    expect(clampDays(1000)).toBe(pricingConfig.MAX_DAYS);
  });

  test('rounds to the nearest whole day within range', () => {
    expect(clampDays(30.4)).toBe(30);
    expect(clampDays(30.6)).toBe(31);
  });

  test('passes through an already-valid value unchanged', () => {
    expect(clampDays(90)).toBe(90);
  });
});

describe('calcPrice', () => {
  test('matches the real formula exactly: base * days^0.425', () => {
    expect(calcPrice(30, 'course')).toBeCloseTo(39 * Math.pow(30, 0.425), 10);
    expect(calcPrice(30, 'qbank')).toBeCloseTo(25 * Math.pow(30, 0.425), 10);
    expect(calcPrice(30, 'bundle')).toBeCloseTo(52 * Math.pow(30, 0.425), 10);
  });

  test('price increases with days but at a diminishing per-day rate', () => {
    const price30 = calcPrice(30, 'qbank');
    const price60 = calcPrice(60, 'qbank');
    const perDay30 = price30 / 30;
    const perDay60 = price60 / 60;
    expect(price60).toBeGreaterThan(price30);
    expect(perDay60).toBeLessThan(perDay30);
  });

  test('at the minimum day count, every plan resolves to its base-driven starting price', () => {
    expect(calcPrice(pricingConfig.MIN_DAYS, 'course')).toBeGreaterThan(0);
  });
});

describe('calcPricePerDay', () => {
  test('is calcPrice(days) / days, rounded', () => {
    const days = 30;
    expect(calcPricePerDay(days, 'qbank')).toBe(Math.round(calcPrice(days, 'qbank') / days));
  });
});

describe('calcBundleSavings', () => {
  test('the bundle is cheaper than buying course + qbank separately across the FULL supported day range', () => {
    for (let days = pricingConfig.MIN_DAYS; days <= pricingConfig.MAX_DAYS; days += 7) {
      const separate = calcPrice(days, 'course') + calcPrice(days, 'qbank');
      const bundle = calcPrice(days, 'bundle');
      expect(bundle).toBeLessThan(separate);
      expect(calcBundleSavings(days)).toBeGreaterThan(0);
    }
    // Also check the exact boundaries, not just the sampled steps.
    for (const days of [pricingConfig.MIN_DAYS, pricingConfig.MAX_DAYS]) {
      expect(calcPrice(days, 'bundle')).toBeLessThan(calcPrice(days, 'course') + calcPrice(days, 'qbank'));
    }
  });

  test('savings is never negative, even in a hypothetical misconfigured-base scenario', () => {
    expect(calcBundleSavings(30)).toBeGreaterThanOrEqual(0);
  });
});

describe('planFeatures', () => {
  test('course includes lessons only, not QBank or exams', () => {
    expect(planFeatures('course')).toEqual({
      plan: 'course',
      includesLessons: true,
      includesQbank: false,
      includesExams: false,
    });
  });

  test('qbank includes QBank and exams, not lessons — exams ship with QBank, not Course', () => {
    expect(planFeatures('qbank')).toEqual({
      plan: 'qbank',
      includesLessons: false,
      includesQbank: true,
      includesExams: true,
    });
  });

  test('bundle includes everything', () => {
    expect(planFeatures('bundle')).toEqual({
      plan: 'bundle',
      includesLessons: true,
      includesQbank: true,
      includesExams: true,
    });
  });
});
