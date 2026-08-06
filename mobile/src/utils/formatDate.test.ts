import { formatRelativeDate } from './formatDate';

const NOW = new Date(2026, 0, 15, 14, 30, 0); // Jan 15 2026, 2:30 PM local

describe('formatRelativeDate', () => {
  test('null timestamp reads "Never"', () => {
    expect(formatRelativeDate(null, NOW)).toBe('Never');
  });

  test('today formats as "Today at H:MM AM/PM"', () => {
    const today = new Date(2026, 0, 15, 9, 5, 0);
    expect(formatRelativeDate(today.toISOString(), NOW)).toBe('Today at 9:05 AM');
  });

  test('yesterday formats as "Yesterday"', () => {
    const yesterday = new Date(2026, 0, 14, 23, 0, 0);
    expect(formatRelativeDate(yesterday.toISOString(), NOW)).toBe('Yesterday');
  });

  test('older dates format as "Mon D"', () => {
    const older = new Date(2026, 0, 10, 12, 0, 0);
    expect(formatRelativeDate(older.toISOString(), NOW)).toBe('Jan 10');
  });

  test('noon and midnight format correctly (12-hour boundary)', () => {
    const noon = new Date(2026, 0, 15, 12, 0, 0);
    const midnight = new Date(2026, 0, 15, 0, 0, 0);
    expect(formatRelativeDate(noon.toISOString(), NOW)).toBe('Today at 12:00 PM');
    expect(formatRelativeDate(midnight.toISOString(), NOW)).toBe('Today at 12:00 AM');
  });
});
