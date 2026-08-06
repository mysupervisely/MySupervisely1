import { BODY_MAP_ASPECT_RATIO, BODY_MAP_VIEWBOX, scaleBodyMapPoint } from './bodyMap';
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
