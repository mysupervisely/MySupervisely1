import { buildGreeting, timeOfDayGreeting } from './greeting';

describe('timeOfDayGreeting', () => {
  test.each([
    [0, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [17, 'Good afternoon'],
    [18, 'Good evening'],
    [23, 'Good evening'],
  ] as const)('hour %i -> %s', (hour, expected) => {
    expect(timeOfDayGreeting(hour)).toBe(expected);
  });
});

describe('buildGreeting', () => {
  test('includes the stored first name when available', () => {
    const morning = new Date(2026, 0, 1, 9, 0, 0);
    expect(buildGreeting(morning, 'Kirollos')).toBe('Good morning, Kirollos');
  });

  test('falls back to a plain salutation when no name is stored', () => {
    const evening = new Date(2026, 0, 1, 20, 0, 0);
    expect(buildGreeting(evening, null)).toBe('Good evening');
  });
});
