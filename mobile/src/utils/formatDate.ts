/** Pure, testable date formatting for the Progress dashboard — no i18n library, just the common cases. */

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${period}`;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** "Today at 2:30 PM" / "Yesterday" / "Jan 10" / "Never" for a null timestamp. */
export function formatRelativeDate(iso: string | null, now: Date): string {
  if (!iso) return 'Never';
  const date = new Date(iso);

  if (isSameLocalDay(date, now)) {
    return `Today at ${formatTime(date)}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameLocalDay(date, yesterday)) {
    return 'Yesterday';
  }

  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
