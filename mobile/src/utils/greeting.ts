/** Pure, testable time-of-day greeting logic — no dependency on the clock at call sites. */
export function timeOfDayGreeting(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** e.g. "Good morning, Kirollos" or just "Good morning" when no name is stored yet. */
export function buildGreeting(now: Date, firstName: string | null): string {
  const salutation = timeOfDayGreeting(now.getHours());
  return firstName ? `${salutation}, ${firstName}` : salutation;
}
