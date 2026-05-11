import {
  format, isToday, isYesterday, isThisYear, parseISO,
} from 'date-fns';

/** Smart date label: today→HH:mm, yesterday→"Yesterday", this year→"Jan 5", older→"Jan 5, 2023" */
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

/** Full date: "Monday, January 5, 2025 14:30" */
export function fullDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = typeof dateStr === 'string' ? parseISO(dateStr) : new Date(dateStr);
    return format(d, 'EEEE, MMMM d, yyyy HH:mm');
  } catch { return ''; }
}

/** Attachment download/inline URL */
export function getAttachmentUrl(id, inline = false) {
  return `/api/attachments/${id}${inline ? '?inline=1' : ''}`;
}

/** Format an address object {name, email} for display */
export function formatAddress(addr) {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  const { name, email } = addr;
  return name ? `${name} <${email}>` : email;
}

/** Format array of addresses */
export function formatAddressList(addrs) {
  if (!addrs) return '';
  if (typeof addrs === 'string') {
    try { addrs = JSON.parse(addrs); } catch { return addrs; }
  }
  return (Array.isArray(addrs) ? addrs : [addrs]).map(formatAddress).join(', ');
}

/** Normalise subject for display (strip excessive Re:/Fwd: chains) */
export function cleanSubject(subject) {
  if (!subject) return '(no subject)';
  return subject.replace(/^((re|fwd?|aw|rv|sv):\s*)+/gi, '').trim() || '(no subject)';
}

/** File size human readable */
export function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Build reply body with quoted text */
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

/** Build reply subject */
export function buildReplySubject(subject, mode = 'reply') {
  const clean = (subject || '').replace(/^((re|fwd?|aw):\s*)+/gi, '').trim();
  return mode === 'forward' ? `Fwd: ${clean}` : `Re: ${clean}`;
}

/** Extract To addresses for Reply All (exclude own address) */
export function buildReplyAllTo(message, ownEmail) {
  const toAddrs = Array.isArray(message.to_addresses) ? message.to_addresses : [];
  const ccAddrs = Array.isArray(message.cc_addresses) ? message.cc_addresses : [];
  const from    = message.from_address ? [{ name: message.from_name || '', email: message.from_address }] : [];

  return [...from, ...toAddrs, ...ccAddrs]
    .filter(a => a.email && a.email.toLowerCase() !== ownEmail?.toLowerCase());
}

/** Check MIME type is previewable image */
export function isImageMime(mime) {
  return /^image\/(jpeg|png|gif|webp|svg\+xml)/.test(mime);
}

/** Sanitise HTML for preview (very basic — browser sandbox handles the real security) */
export function sanitiseHtml(html) {
  // Remove script tags
  return (html || '').replace(/<script[\s\S]*?<\/script>/gi, '');
}

/** Get initials for avatar */
export function getInitials(name, email) {
  const src = name || email || '?';
  const parts = src.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src[0]?.toUpperCase() || '?';
}

/** MIME icon mapping */
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
