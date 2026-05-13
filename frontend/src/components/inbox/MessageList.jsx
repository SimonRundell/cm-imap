/**
 * @module components/inbox/MessageList
 * @fileoverview Scrollable, paginated list of messages for the active folder or search.
 *
 * Builds query params from emailStore selection and renders a MessageItem for
 * each result. Includes a manual sync button with live progress toasts and
 * simple prev/next pagination.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import MessageItem from './MessageItem';
import useEmailStore from '@/store/emailStore';
import { useMessages } from '@/hooks/useMessages';
import { useQueryClient } from '@tanstack/react-query';
import { syncAccount as apiSync, getSyncProgress } from '@/api/accounts';
import useUIStore from '@/store/uiStore';

/**
 * Format a sync progress payload into a human-readable toast message.
 * @param {{stage: string, folder?: string, total?: number, done?: number}} p
 * @returns {string}
 */
function formatProgress(p) {
  if (p.stage === 'scanning') return `Scanning ${p.folder || ''}…`;
  if (p.stage === 'fetching') {
    const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
    return `Syncing ${p.folder || ''}: ${p.done} / ${p.total} (${pct}%)`;
  }
  return 'Syncing…';
}

/**
 * Message list panel. Reads the current folder/account/search selection from
 * emailStore, fetches messages via useMessages, and renders them as MessageItem
 * rows. Handles sync (single account or all accounts) and pagination.
 * @returns {React.ReactElement}
 */
export default function MessageList() {
  const [page, setPage]             = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);

  const selectedFolderId   = useEmailStore(s => s.selectedFolderId);
  const selectedAccountId  = useEmailStore(s => s.selectedAccountId);
  const isUnified          = useEmailStore(s => s.isUnifiedInbox);
  const searchQuery        = useEmailStore(s => s.searchQuery);
  const selectedMessageId  = useEmailStore(s => s.selectedMessageId);
  const setSelectedMessage = useEmailStore(s => s.setSelectedMessage);
  const accounts           = useEmailStore(s => s.accounts);
  const qc                 = useQueryClient();

  const [syncing, setSyncing]       = useState(false);
  const addToast    = useUIStore(s => s.addToast);
  const updateToast = useUIStore(s => s.updateToast);
  const removeToast = useUIStore(s => s.removeToast);
  const pollRef     = useRef(null);
  const toastIdRef  = useRef(null);

  const params = {
    page,
    per_page: 50,
    ...(isUnified         && { unified: 1 }),
    ...(selectedFolderId  && { folder_id: selectedFolderId }),
    ...(selectedAccountId && !isUnified && { account_id: selectedAccountId }),
    ...(searchQuery       && { search: searchQuery }),
    ...(unreadOnly        && { unread: 1 }),
  };

  // Reset to page 1 whenever the folder/account context changes
  useEffect(() => { setPage(1); }, [selectedFolderId, selectedAccountId, isUnified, searchQuery]);

  // Cleanup polling and toast if the component unmounts mid-sync
  useEffect(() => () => {
    clearInterval(pollRef.current);
    if (toastIdRef.current !== null) removeToast(toastIdRef.current);
  }, []);

  const { data, isLoading, isFetching, refetch } = useMessages(params);
  const messages = data?.messages  || [];
  const total    = data?.total     || 0;
  const lastPage = data?.last_page || 1;

  const handleSync = async () => {
    setSyncing(true);

    // Persistent toast (duration=0 means no auto-dismiss)
    const tid = addToast('Connecting to mail server…', 'info', 0);
    toastIdRef.current = tid;

    // Which account to poll progress from (first one if syncing all)
    const primaryId = selectedAccountId || accounts[0]?.id;

    if (primaryId) {
      const poll = async () => {
        try {
          const p = await getSyncProgress(primaryId);
          if (p && p.stage !== 'idle') {
            updateToast(tid, formatProgress(p));
          }
        } catch { /* ignore poll errors */ }
      };
      poll(); // fire immediately, don't wait for first interval tick
      pollRef.current = setInterval(poll, 500);
    }

    try {
      if (selectedAccountId) {
        await apiSync(selectedAccountId);
      } else {
        await Promise.all(accounts.map(a => apiSync(a.id)));
      }
      await refetch();
      updateToast(tid, 'Sync complete');
      setTimeout(() => { removeToast(tid); toastIdRef.current = null; }, 3000);
    } catch {
      updateToast(tid, 'Sync failed — check your connection settings');
      setTimeout(() => { removeToast(tid); toastIdRef.current = null; }, 5000);
    } finally {
      clearInterval(pollRef.current);
      pollRef.current = null;
      setSyncing(false);
    }
  };

  const handleSelectMessage = useCallback((msg) => {
    setSelectedMessage(msg.id);
    // Optimistically mark as read in the list cache so the row style updates immediately
    if (!msg.is_read) {
      qc.setQueriesData({ queryKey: ['messages'] }, (old) => {
        if (!old?.messages) return old;
        return { ...old, messages: old.messages.map(m => m.id === msg.id ? { ...m, is_read: 1 } : m) };
      });
    }
  }, [setSelectedMessage, qc]);

  // Title
  let title = 'All Inboxes';
  if (searchQuery) title = `Search: "${searchQuery}"`;
  else if (selectedFolderId) title = 'Folder';

  return (
    <div className="flex flex-col h-full bg-surface-900 border-r border-slate-700/50">
      {/* List header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {total > 0 && <span className="text-xs text-slate-500">{total.toLocaleString()}</span>}
          {(isLoading || isFetching) && (
            <svg className="w-3.5 h-3.5 animate-spin text-blue-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Filter: unread only */}
          <button
            onClick={() => { setUnreadOnly(v => !v); setPage(1); }}
            title={unreadOnly ? 'Showing unread only — click to show all' : 'Show unread only'}
            className={`p-1.5 rounded-lg transition-colors ${unreadOnly
              ? 'bg-blue-600 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </button>
          {/* Sync */}
          <button
            onClick={handleSync}
            disabled={syncing}
            title="Sync email"
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`}
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-slate-500 text-sm">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500">
            <svg className="w-10 h-10 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">{searchQuery ? 'No results found' : 'No messages'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/20 group">
            {messages.map(msg => (
              <MessageItem
                key={msg.id}
                message={msg}
                isSelected={msg.id === selectedMessageId}
                onClick={() => handleSelectMessage(msg)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-700/50 shrink-0">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            ← Prev
          </button>
          <span className="text-xs text-slate-500">{page} / {lastPage}</span>
          <button
            onClick={() => setPage(p => Math.min(lastPage, p + 1))}
            disabled={page === lastPage}
            className="text-xs text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
