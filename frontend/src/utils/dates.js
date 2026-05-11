import {
  format, formatDistanceToNow, isToday, isYesterday,
  isThisYear, parseISO,
} from 'date-fns';

export function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    return typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
  } catch {
    return null;
  }
}

/** Smart date label: Today→time, Yesterday→"Yesterday", This year→"Jan 5", Older→"Jan 5, 2023" */
export function smartDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  if (isToday(d))     return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';
  if (isThisYear(d))  return format(d, 'MMM d');
  return format(d, 'MMM d, yyyy');
}

/** Full date string */
export function fullDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return format(d, 'EEEE, MMMM d, yyyy HH:mm');
}

/** Relative time: "5 minutes ago" */
export function relativeDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return formatDistanceToNow(d, { addSuffix: true });
}

/** Format for date input fields */
export function toDateInputValue(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return format(d, 'yyyy-MM-dd');
}
