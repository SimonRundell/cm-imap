import { useState } from 'react';
import useEmailStore from '@/store/emailStore';
import useUIStore    from '@/store/uiStore';
import { useAccounts, useAllFolders, useSyncAccount } from '@/hooks/useAccounts';
import { formatAddress } from '@/utils/email';

const SPECIAL_ORDER = { inbox: 0, sent: 1, drafts: 2, archive: 3, spam: 4, trash: 5 };
const SPECIAL_ICONS = {
  inbox:   'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  sent:    'M12 19l9 2-9-18-9 18 9-2zm0 0v-8',
  drafts:  'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  trash:   'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
  spam:    'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  archive: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
  default: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
};

function FolderIcon({ special }) {
  const path = SPECIAL_ICONS[special] || SPECIAL_ICONS.default;
  return (
    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

function AccountSection({ account, folders, isExpanded, onToggle }) {
  const selectedFolderId  = useEmailStore(s => s.selectedFolderId);
  const selectedAccountId = useEmailStore(s => s.selectedAccountId);
  const setSelectedFolder = useEmailStore(s => s.setSelectedFolder);
  const syncAccount       = useSyncAccount();

  const accountFolders = (folders || [])
    .filter(f => f.account_id === account.id && f.is_subscribed)
    .sort((a, b) => {
      const ao = SPECIAL_ORDER[a.special_use] ?? 99;
      const bo = SPECIAL_ORDER[b.special_use] ?? 99;
      return ao !== bo ? ao - bo : a.name.localeCompare(b.name);
    });

  const totalUnread = accountFolders
    .filter(f => f.special_use === 'inbox')
    .reduce((s, f) => s + (f.unread_count || 0), 0);

  return (
    <div className="mb-1">
      {/* Account header */}
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-left
                   hover:bg-slate-700/50 group transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {account.email_address[0].toUpperCase()}
          </div>
          <span className="text-sm font-medium text-slate-200 truncate">{account.display_name}</span>
          {totalUnread > 0 && (
            <span className="text-xs bg-blue-600 text-white rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
              {totalUnread}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); syncAccount.mutate(account.id); }}
            title="Sync account"
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-slate-600 text-slate-400 hover:text-white"
          >
            <svg className={`w-3.5 h-3.5 ${syncAccount.isPending ? 'animate-spin' : ''}`}
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <svg className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
               fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Folders */}
      {isExpanded && (
        <div className="pl-3 space-y-0.5">
          {accountFolders.map(folder => (
            <button
              key={folder.id}
              onClick={() => setSelectedFolder(folder.id, account.id)}
              className={`flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-left text-sm
                transition-colors ${selectedFolderId === folder.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700/60'}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <FolderIcon special={folder.special_use} />
                <span className="truncate">{folder.name}</span>
              </div>
              {folder.unread_count > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center
                  ${selectedFolderId === folder.id ? 'bg-blue-500' : 'bg-slate-600 text-slate-300'}`}>
                  {folder.unread_count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const collapsed         = useUIStore(s => s.sidebarCollapsed);
  const setUnified        = useEmailStore(s => s.setUnifiedInbox);
  const isUnified         = useEmailStore(s => s.isUnifiedInbox);
  const openCompose       = useEmailStore(s => s.openCompose);
  const [expanded, setExpanded] = useState({});

  const { data: accounts = [] } = useAccounts();
  const { data: folders  = [] } = useAllFolders();

  const toggleExpand = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  // Default: expand first account
  const effectiveExpanded = (id) => id in expanded ? expanded[id] : accounts[0]?.id === id;

  if (collapsed) return null;

  const totalUnread = folders
    .filter(f => f.special_use === 'inbox')
    .reduce((s, f) => s + (f.unread_count || 0), 0);

  return (
    <aside className="w-60 shrink-0 bg-surface-800 border-r border-slate-700/50 flex flex-col h-full">
      {/* Compose button */}
      <div className="p-3">
        <button
          onClick={() => openCompose('new', null, accounts[0]?.id)}
          className="flex items-center gap-2 w-full bg-blue-600 hover:bg-blue-500 text-white
                     font-medium py-2 px-4 rounded-xl transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Compose
        </button>
      </div>

      {/* Unified inbox */}
      <div className="px-3 pb-2">
        <button
          onClick={setUnified}
          className={`flex items-center justify-between w-full px-2 py-1.5 rounded-lg text-sm transition-colors
            ${isUnified ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700/60'}`}
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            All Inboxes
          </div>
          {totalUnread > 0 && (
            <span className={`text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center
              ${isUnified ? 'bg-blue-500' : 'bg-slate-600 text-slate-300'}`}>
              {totalUnread}
            </span>
          )}
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-slate-700/50 mb-2" />

      {/* Accounts + folders */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1 scrollbar-thin">
        {accounts.length === 0 ? (
          <p className="text-xs text-slate-500 px-2 py-4 text-center">
            No accounts yet.<br/>Add one in Settings.
          </p>
        ) : (
          accounts.map(acc => (
            <AccountSection
              key={acc.id}
              account={acc}
              folders={folders}
              isExpanded={effectiveExpanded(acc.id)}
              onToggle={() => toggleExpand(acc.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
