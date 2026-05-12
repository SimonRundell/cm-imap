/**
 * @module utils/dates
 * @fileoverview General-purpose date formatting helpers used across the UI.
 *
 * Some functions (smartDate, fullDate) overlap with utils/email.js — this
 * module provides the canonical implementations that also handle the
 * relative-time and date-input-value use cases.
 */
import {
  format, formatDistanceToNow, isToday, isYesterday,
  isThisYear, parseISO,
} from 'date-fns';

/**
 * Parse an ISO date string or Date object into a Date, returning null on failure.
 * All other helpers in this module delegate to this function for consistency.
 * @param {string|Date|null} dateStr - Value to parse.
 * @returns {Date|null}
 */
export function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    return typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
  } catch {
    return null;
  }
}

/**
 * Format a date string into a short, context-aware label:
 * today → "HH:mm", yesterday → "Yesterday", this year → "Jan 5", older → "Jan 5, 2023".
 * @param {string|Date|null} dateStr - Value to format.
 * @returns {string} Formatted label, or an empty string when the input cannot be parsed.
 */
export function smartDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  if (isToday(d))     return format(d, 'HH:mm');
  if (isYesterday(d)) return 'Yesterday';
  if (isThisYear(d))  return format(d, 'MMM d');
  return format(d, 'MMM d, yyyy');
}

/**
 * Format a date string as a verbose full timestamp, e.g. "Monday, January 5, 2025 14:30".
 * @param {string|Date|null} dateStr - Value to format.
 * @returns {string} Formatted string, or an empty string on parse failure.
 */
export function fullDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return format(d, 'EEEE, MMMM d, yyyy HH:mm');
}

/**
 * Return a human-readable relative time string, e.g. "5 minutes ago" or "about 3 hours ago".
 * @param {string|Date|null} dateStr - Value to format.
 * @returns {string} Relative time string, or an empty string on parse failure.
 */
export function relativeDate(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Format a date value as an HTML date-input compatible string ("yyyy-MM-dd").
 * @param {string|Date|null} dateStr - Value to format.
 * @returns {string} "yyyy-MM-dd" string, or an empty string on parse failure.
 */
export function toDateInputValue(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '';
  return format(d, 'yyyy-MM-dd');
}
