import { BODY_MAP_ASPECT_RATIO, BODY_MAP_VIEWBOX, scaleBodyMapPoint, separateOverlappingTouchTargets } from './bodyMap';
import realSystems from '../content/generated/systems.json';
import type { System } from '../models';

describe('scaleBodyMapPoint', () => {
  test('scales proportionally to the rendered container size, not a hardcoded pixel value', () => {
    const point = { x: 150, y: 320 }; // center of the 300x640 viewBox
    const small = scaleBodyMapPoint(point, { width: 300, height: 640 });
    const large = scaleBodyMapPoint(point, { width: 900, height: 1920 }); // 3x container

    expect(small).toEqual({ x: 150, y: 320 });
    expect(large).toEqual({ x: 450, y: 960 });
    // The ratio holds regardless of the absolute container size — this is
    // what "hotspots must scale proportionally with the rendered image
    // size" means in practice.
    expect(large.x / small.x).toBeCloseTo(3);
    expect(large.y / small.y).toBeCloseTo(3);
  });

  test('the origin and far corner map exactly to the container edges', () => {
    const container = { width: 450, height: 960 };
    expect(scaleBodyMapPoint({ x: 0, y: 0 }, container)).toEqual({ x: 0, y: 0 });
    expect(
      scaleBodyMapPoint({ x: BODY_MAP_VIEWBOX.width, y: BODY_MAP_VIEWBOX.height }, container)
    ).toEqual({ x: container.width, y: container.height });
  });

  test('BODY_MAP_ASPECT_RATIO matches the real viewBox (300:640), not a placeholder ratio', () => {
    expect(BODY_MAP_ASPECT_RATIO).toBeCloseTo(300 / 640);
  });

  test('every real anatomical system coordinate scales within the container bounds', () => {
    const systems = realSystems as unknown as System[];
    const anatomical = systems.filter((s) => s.isAnatomical);
    expect(anatomical).toHaveLength(8); // real data, not a placeholder set

    const container = { width: 375, height: 375 / BODY_MAP_ASPECT_RATIO }; // a plausible phone width
    for (const system of anatomical) {
      const scaled = scaleBodyMapPoint({ x: system.x as number, y: system.y as number }, container);
      expect(scaled.x).toBeGreaterThanOrEqual(0);
      expect(scaled.x).toBeLessThanOrEqual(container.width);
      expect(scaled.y).toBeGreaterThanOrEqual(0);
      expect(scaled.y).toBeLessThanOrEqual(container.height);
    }
  });
});

describe('separateOverlappingTouchTargets', () => {
  const MIN_DISTANCE = 44;

  test('leaves points untouched when already far enough apart', () => {
    const points = [
      { key: 'a', x: 0, y: 0 },
      { key: 'b', x: 100, y: 0 },
    ];
    expect(separateOverlappingTouchTargets(points, MIN_DISTANCE)).toEqual(points);
  });

  test('pushes two overlapping points apart until exactly minDistance, splitting the move evenly', () => {
    const points = [
      { key: 'a', x: 0, y: 0 },
      { key: 'b', x: 20, y: 0 }, // 20pt apart, well under 44
    ];
    const result = separateOverlappingTouchTargets(points, MIN_DISTANCE);
    const distance = Math.hypot(result[1].x - result[0].x, result[1].y - result[0].y);
    expect(distance).toBeCloseTo(MIN_DISTANCE);
    // Symmetric: each point moved the same amount from its original position.
    expect(Math.abs(result[0].x - points[0].x)).toBeCloseTo(Math.abs(result[1].x - points[1].x));
  });

  test('preserves every other field on the point, not just x/y', () => {
    const points = [
      { key: 'a', label: 'GI', x: 0, y: 0 },
      { key: 'b', label: 'Endocrine', x: 10, y: 0 },
    ];
    const result = separateOverlappingTouchTargets(points, MIN_DISTANCE);
    expect(result[0].key).toBe('a');
    expect(result[0].label).toBe('GI');
    expect(result[1].key).toBe('b');
    expect(result[1].label).toBe('Endocrine');
  });

  test('does not mutate the input array', () => {
    const points = [
      { key: 'a', x: 0, y: 0 },
      { key: 'b', x: 10, y: 0 },
    ];
    const snapshot = JSON.parse(JSON.stringify(points));
    separateOverlappingTouchTargets(points, MIN_DISTANCE);
    expect(points).toEqual(snapshot);
  });

  test('coincident points (distance 0) are left as-is rather than dividing by zero', () => {
    const points = [
      { key: 'a', x: 5, y: 5 },
      { key: 'b', x: 5, y: 5 },
    ];
    const result = separateOverlappingTouchTargets(points, MIN_DISTANCE);
    expect(result).toEqual(points);
  });

  test('the real GI/Endocrine coordinates, scaled to a 320pt-wide device, end up >= 44pt apart after separation', () => {
    const gi = realSystems.find((s) => s.key === 'gi') as System;
    const endocrine = realSystems.find((s) => s.key === 'endocrine') as System;
    const container = { width: 320, height: 320 / BODY_MAP_ASPECT_RATIO };

    const scaledGi = { key: 'gi', ...scaleBodyMapPoint({ x: gi.x as number, y: gi.y as number }, container) };
    const scaledEndocrine = {
      key: 'endocrine',
      ...scaleBodyMapPoint({ x: endocrine.x as number, y: endocrine.y as number }, container),
    };

    // Confirms the overlap is real before the fix (matches docs/M3_QA_REVIEW.md #7's ~35.8pt finding).
    const rawDistance = Math.hypot(scaledGi.x - scaledEndocrine.x, scaledGi.y - scaledEndocrine.y);
    expect(rawDistance).toBeLessThan(44);

    const [separatedGi, separatedEndocrine] = separateOverlappingTouchTargets([scaledGi, scaledEndocrine], 44);
    const fixedDistance = Math.hypot(separatedGi.x - separatedEndocrine.x, separatedGi.y - separatedEndocrine.y);
    expect(fixedDistance).toBeGreaterThanOrEqual(44 - 0.01); // float-safe >=
  });

  test('a third, unrelated point far away is never moved by a nearby overlapping pair', () => {
    const points = [
      { key: 'a', x: 0, y: 0 },
      { key: 'b', x: 10, y: 0 }, // overlapping with 'a'
      { key: 'c', x: 1000, y: 1000 }, // far from both
    ];
    const result = separateOverlappingTouchTargets(points, MIN_DISTANCE);
    expect(result[2]).toEqual(points[2]);
  });
});
