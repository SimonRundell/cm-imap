/**
 * @module utils/email
 * @fileoverview Email display utilities: date formatting, address formatting,
 * subject normalisation, reply/forward body building, HTML sanitisation,
 * attachment helpers, and MIME-type icon mapping.
 */
import {
  format, isToday, isYesterday, isThisYear, parseISO,
} from 'date-fns';

/**
 * Format a date string into a short, context-aware label:
 * today → "HH:mm", yesterday → "Yesterday", this year → "Jan 5", older → "Jan 5, 2023".
 * @param {string|Date} dateStr - ISO date string or Date object.
 * @returns {string} Formatted label, or an empty string on parse failure.
 */
export function smartDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    if (isToday(d))     return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Yesterday';
    if (isThisYear(d))  return format(d, 'MMM d');
    return format(d, 'MMM d, yyyy');
  } catch { return ''; }
}

/**
 * Format a date string as a verbose full timestamp, e.g. "Monday, January 5, 2025 14:30".
 * @param {string|Date} dateStr - ISO date string or Date object.
 * @returns {string} Formatted string, or an empty string on parse failure.
 */
export function fullDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    return format(d, 'EEEE, MMMM d, yyyy HH:mm');
  } catch { return ''; }
}

/**
 * Build the URL to download or inline-preview an attachment from the API.
 * @param {number} id - Attachment ID.
 * @param {boolean} [inline=false] - Pass true to add ?inline=1 for in-browser rendering.
 * @returns {string} Absolute path URL string.
 */
export function getAttachmentUrl(id, inline = false) {
  return `/api/attachments/${id}${inline ? '?inline=1' : ''}`;
}

/**
 * Format a single address object for display, e.g. "Alice Smith <alice@example.com>".
 * Accepts either an object with name/email keys or a plain string.
 * @param {{name: string, email: string}|string|null} addr - Address to format.
 * @returns {string} Human-readable address string, or an empty string if addr is falsy.
 */
export function formatAddress(addr) {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  const { name, email } = addr;
  return name ? `${name} <${email}>` : email;
}

/**
 * Format an array (or JSON string) of address objects into a comma-separated list.
 * @param {Array<{name: string, email: string}>|string|null} addrs - Array of address objects or a JSON string.
 * @returns {string} Comma-separated display string.
 */
export function formatAddressList(addrs) {
  if (!addrs) return '';
  if (typeof addrs === 'string') {
    try { addrs = JSON.parse(addrs); } catch { return addrs; }
  }
  return (Array.isArray(addrs) ? addrs : [addrs]).map(formatAddress).join(', ');
}

/**
 * Strip leading Re:/Fwd:/Aw: prefixes from a subject line for clean display.
 * Falls back to "(no subject)" for blank input.
 * @param {string|null} subject - Raw subject string.
 * @returns {string} Cleaned subject, never an empty string.
 */
export function cleanSubject(subject) {
  if (!subject) return '(no subject)';
  return subject.replace(/^((re|fwd?|aw|rv|sv):\s*)+/gi, '').trim() || '(no subject)';
}

/**
 * Convert a byte count to a human-readable string (B / KB / MB).
 * @param {number|null} bytes - File size in bytes.
 * @returns {string} Formatted string, or an empty string if bytes is falsy.
 */
export function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Compose the initial HTML body for a reply or forward, including a quoted
 * version of the original message wrapped in a blockquote.
 * @param {object} message - Original message object (body_html, body_text, from_name, from_address, date, subject).
 * @param {'reply'|'forward'} [mode='reply'] - Whether to produce a reply attribution or a forward header.
 * @returns {string} HTML string to pre-populate the composer.
 */
export function buildReplyBody(message, mode = 'reply') {
  const from   = formatAddress({ name: message.from_name, email: message.from_address });
  const date   = message.date ? new Date(message.date).toLocaleString() : '';
  const prefix = mode === 'forward'
    ? `---------- Forwarded message ----------<br>From: ${from}<br>Date: ${date}<br>Subject: ${message.subject}<br><br>`
    : `On ${date}, ${from} wrote:<br>`;

  const quotedHtml = message.body_html
    ? `<blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${message.body_html}</blockquote>`
    : `<blockquote>${(message.body_text || '').replace(/\n/g, '<br>')}</blockquote>`;

  return `<br><br>${prefix}${quotedHtml}`;
}

/**
 * Build an appropriate subject line for a reply or forward, prepending
 * "Re:" or "Fwd:" after stripping any existing prefix chains.
 * @param {string|null} subject - Original message subject.
 * @param {'reply'|'forward'} [mode='reply'] - Determines the prefix added.
 * @returns {string} Subject string for the new message.
 */
export function buildReplySubject(subject, mode = 'reply') {
  const clean = (subject || '').replace(/^((re|fwd?|aw):\s*)+/gi, '').trim();
  return mode === 'forward' ? `Fwd: ${clean}` : `Re: ${clean}`;
}

/**
 * Build the To address list for a Reply-All, combining the original sender
 * with all To/Cc recipients while excluding the user's own address.
 * @param {object} message - Original message (from_name, from_address, to_addresses, cc_addresses).
 * @param {string|null} ownEmail - The authenticated user's email address to exclude.
 * @returns {Array<{name: string, email: string}>} De-duplicated recipient list.
 */
export function buildReplyAllTo(message, ownEmail) {
  const toAddrs = Array.isArray(message.to_addresses) ? message.to_addresses : [];
  const ccAddrs = Array.isArray(message.cc_addresses) ? message.cc_addresses : [];
  const from    = message.from_address ? [{ name: message.from_name || '', email: message.from_address }] : [];

  return [...from, ...toAddrs, ...ccAddrs]
    .filter(a => a.email && a.email.toLowerCase() !== ownEmail?.toLowerCase());
}

/**
 * Return true when the MIME type represents a browser-previewable image format.
 * @param {string} mime - MIME type string, e.g. "image/png".
 * @returns {boolean}
 */
export function isImageMime(mime) {
  return /^image\/(jpeg|png|gif|webp|svg\+xml)/.test(mime);
}

/**
 * Strip `<script>` tags from an HTML string before rendering in an iframe.
 * This is a basic defence-in-depth measure; the iframe's sandbox attribute
 * provides the primary security boundary.
 * @param {string|null} html - Raw HTML string from a message body.
 * @returns {string} HTML with script tags removed.
 */
export function sanitiseHtml(html) {
  // Remove script tags
  return (html || '').replace(/<script[\s\S]*?<\/script>/gi, '');
}

/**
 * Derive one or two uppercase initials from a display name or email address.
 * Used to populate the avatar circle in the message list.
 * @param {string|null} name  - Display name (preferred source).
 * @param {string|null} email - Email address (fallback source).
 * @returns {string} One or two uppercase initial characters.
 */
export function getInitials(name, email) {
  const src = name || email || '?';
  const parts = src.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src[0]?.toUpperCase() || '?';
}

/**
 * Map a MIME type to a logical icon category name used by the attachment UI.
 * @param {string|null} mimeType - MIME type string, e.g. "application/pdf".
 * @returns {'image'|'video'|'audio'|'pdf'|'archive'|'document'|'spreadsheet'|'text'|'file'}
 */
export function mimeIcon(mimeType) {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/'))       return 'image';
  if (mimeType.startsWith('video/'))       return 'video';
  if (mimeType.startsWith('audio/'))       return 'audio';
  if (mimeType.includes('pdf'))            return 'pdf';
  if (mimeType.includes('zip') || mimeType.includes('compressed')) return 'archive';
  if (mimeType.includes('word') || mimeType.includes('document'))  return 'document';
  if (mimeType.includes('sheet') || mimeType.includes('excel'))    return 'spreadsheet';
  if (mimeType.includes('text/'))         return 'text';
  return 'file';
}
