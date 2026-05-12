/**
 * @module components/inbox/MessagePreview
 * @fileoverview Full message reading pane with headers, body, and attachments.
 *
 * Renders a placeholder when no message is selected, a loading spinner while
 * fetching, or the full message with action bar (reply, reply-all, forward,
 * star, mark read, move, delete) once loaded.
 *
 * The HTML body is sandboxed inside an iframe for security; a toggle allows
 * switching to the plain-text alternative. Non-inline attachments are listed
 * as download links at the bottom.
 */
import { useState } from 'react';
import { useMessage, useDeleteMessage, useUpdateMessage, useMoveMessage } from '@/hooks/useMessages';
import useEmailStore from '@/store/emailStore';
import { fullDate, formatAddressList, formatAddress, buildReplySubject, buildReplyBody, buildReplyAllTo, sanitiseHtml, formatSize, getAttachmentUrl } from '@/utils/email';
import useAuthStore from '@/store/authStore';
import { useAllFolders } from '@/hooks/useAccounts';

/**
 * Message reading pane. Derives the selected message ID from emailStore,
 * fetches the full message, and renders headers, action bar, body, and
 * attachments. Returns an empty-state placeholder when no message is selected.
 * @returns {React.ReactElement}
 */
export default function MessagePreview() {
  const selectedId     = useEmailStore(s => s.selectedMessageId);
  const openCompose    = useEmailStore(s => s.openCompose);
  const clearSelection = useEmailStore(s => s.clearSelection);
  const user           = useAuthStore(s => s.user);

  const { data: message, isLoading } = useMessage(selectedId);
  const deleteMsg  = useDeleteMessage();
  const updateMsg  = useUpdateMessage();
  const { data: folders = [] } = useAllFolders();

  const [viewMode, setViewMode] = useState('html'); // 'html' | 'text'
  const [showHeaders, setShowHeaders] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  if (!selectedId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600">
        <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={0.8}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="text-sm">Select a message to read</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-slate-500 text-sm">Loading…</div>;
  }

  if (!message) {
    return <div className="flex items-center justify-center h-full text-slate-500 text-sm">Message not found</div>;
  }

  const ownEmail = user?.email;
  const accountFolders = folders.filter(f => f.account_id === message.account_id && f.is_selectable);

  const handleReply = (mode) => {
    const replyTo  = mode === 'reply_all' ? buildReplyAllTo(message, ownEmail) : [{ name: message.from_name || '', email: message.from_address }];
    const subject  = buildReplySubject(message.subject, mode === 'forward' ? 'forward' : 'reply');
    const bodyHtml = buildReplyBody(message, mode === 'forward' ? 'forward' : 'reply');
    openCompose(mode, { ...message, replyTo, subject, bodyHtml }, message.account_id);
  };

  const htmlContent = sanitiseHtml(message.body_html || '');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700/50 shrink-0">
        {/* Subject + close */}
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 className="text-lg font-semibold text-white leading-tight">
            {message.subject || '(no subject)'}
          </h2>
          <button onClick={clearSelection} className="p-1 rounded hover:bg-slate-700 text-slate-500 hover:text-white shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* From/To */}
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 w-8">From</span>
            <span className="text-slate-200">{formatAddress({ name: message.from_name, email: message.from_address })}</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-500 w-8">To</span>
            <span className="text-slate-400 truncate">{formatAddressList(message.to_addresses)}</span>
          </div>
          {message.cc_addresses?.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-slate-500 w-8">Cc</span>
              <span className="text-slate-400 truncate">{formatAddressList(message.cc_addresses)}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 w-8">Date</span>
            <span className="text-slate-400 text-xs">{fullDate(message.date)}</span>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-1 mt-3 flex-wrap">
          <ActionButton icon="reply"    label="Reply"     onClick={() => handleReply('reply')} />
          <ActionButton icon="reply_all" label="Reply All" onClick={() => handleReply('reply_all')} />
          <ActionButton icon="forward"  label="Forward"   onClick={() => handleReply('forward')} />
          <div className="flex-1" />

          {/* Star */}
          <button
            onClick={() => updateMsg.mutate({ id: message.id, data: { is_starred: !message.is_starred } })}
            className={`p-1.5 rounded-lg transition-colors ${message.is_starred ? 'text-yellow-400' : 'text-slate-500 hover:text-yellow-400'}`}
            title={message.is_starred ? 'Unstar' : 'Star'}
          >
            <svg className="w-4 h-4" fill={message.is_starred ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </button>

          {/* Mark read/unread */}
          <button
            onClick={() => updateMsg.mutate({ id: message.id, data: { is_read: !message.is_read } })}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors"
            title={message.is_read ? 'Mark unread' : 'Mark read'}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d={message.is_read
                  ? 'M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76'
                  : 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'}
              />
            </svg>
          </button>

          {/* Move */}
          <div className="relative">
            <button
              onClick={() => setMoveOpen(o => !o)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white transition-colors"
              title="Move to folder"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </button>
            {moveOpen && (
              <MoveMenu folders={accountFolders} messageId={message.id} onClose={() => setMoveOpen(false)} />
            )}
          </div>

          {/* Delete */}
          <button
            onClick={() => deleteMsg.mutate(message.id)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* View mode toggle */}
      {message.body_html && message.body_text && (
        <div className="flex items-center gap-1 px-6 py-2 border-b border-slate-700/30 shrink-0">
          {['html','text'].map(m => (
            <button key={m} onClick={() => setViewMode(m)}
              className={`text-xs px-2 py-1 rounded ${viewMode === m ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-white'}`}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'html' && message.body_html ? (
          <iframe
            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8">
              <style>body{font-family:system-ui,sans-serif;padding:24px;color:#e2e8f0;background:#0f172a;word-break:break-word}
              a{color:#60a5fa}img{max-width:100%}blockquote{border-left:3px solid #475569;margin-left:0;padding-left:1rem;color:#94a3b8}</style>
              </head><body>${htmlContent}</body></html>`}
            className="w-full h-full border-0"
            sandbox="allow-same-origin"
            title="Email content"
          />
        ) : (
          <pre className="px-6 py-4 text-sm text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
            {message.body_text || '(no content)'}
          </pre>
        )}
      </div>

      {/* Attachments */}
      {message.attachments?.filter(a => !a.is_inline).length > 0 && (
        <div className="px-6 py-3 border-t border-slate-700/50 shrink-0">
          <p className="text-xs text-slate-500 mb-2 font-medium">ATTACHMENTS</p>
          <div className="flex flex-wrap gap-2">
            {message.attachments.filter(a => !a.is_inline).map(att => (
              <a
                key={att.id}
                href={getAttachmentUrl(att.id)}
                download={att.filename}
                className="flex items-center gap-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white transition-colors"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="truncate max-w-[200px]">{att.filename}</span>
                <span className="text-xs text-slate-500">{formatSize(att.size)}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Small icon+label button used in the message action bar (Reply, Reply All, Forward).
 * @param {object} props
 * @param {'reply'|'reply_all'|'forward'} props.icon  - Key into the SVG path map.
 * @param {string}   props.label   - Button label text.
 * @param {function(): void} props.onClick - Click handler.
 * @returns {React.ReactElement}
 */
function ActionButton({ icon, label, onClick }) {
  const paths = {
    reply:     'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6',
    reply_all: 'M7 16l-4-4m0 0l4-4m-4 4h11a4 4 0 014 4v1',
    forward:   'M17 8l4 4m0 0l-4 4m4-4H3',
  };
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-300
                 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d={paths[icon]} />
      </svg>
      {label}
    </button>
  );
}

/**
 * Dropdown menu listing selectable folders for moving a message.
 * Calls the useMoveMessage mutation and closes itself on selection.
 * @param {object} props
 * @param {object[]} props.folders   - Folder objects to display (id, name).
 * @param {number}   props.messageId - ID of the message being moved.
 * @param {function(): void} props.onClose - Callback to dismiss the dropdown.
 * @returns {React.ReactElement}
 */
function MoveMenu({ folders, messageId, onClose }) {
  const moveMsg = useMoveMessage();
  return (
    <div className="absolute right-0 top-full mt-1 w-48 bg-surface-800 border border-slate-700 rounded-xl shadow-xl z-10 max-h-60 overflow-y-auto">
      {folders.map(f => (
        <button
          key={f.id}
          onClick={() => { moveMsg.mutate({ id: messageId, folderId: f.id }); onClose(); }}
          className="block w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white"
        >
          {f.name}
        </button>
      ))}
    </div>
  );
}
