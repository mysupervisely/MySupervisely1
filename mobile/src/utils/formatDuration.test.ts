import { formatDuration } from './formatDuration';

describe('formatDuration', () => {
  test('zero formats as 00:00:00', () => {
    expect(formatDuration(0)).toBe('00:00:00');
  });

  test('the full 6-hour exam duration', () => {
    expect(formatDuration(6 * 60 * 60)).toBe('06:00:00');
  });

  test('pads single digits', () => {
    expect(formatDuration(3661)).toBe('01:01:01'); // 1h 1m 1s
  });

  test('negative input clamps to 00:00:00, never a negative display', () => {
    expect(formatDuration(-5)).toBe('00:00:00');
  });

  test('truncates fractional seconds', () => {
    expect(formatDuration(59.9)).toBe('00:00:59');
  });
});
