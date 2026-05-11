import { create } from 'zustand';

const useEmailStore = create((set, get) => ({
  // Accounts
  accounts: [],
  setAccounts: (accounts) => set({ accounts }),

  // Folders
  folders: [],
  setFolders: (folders) => set({ folders }),

  // Selected state
  selectedAccountId: null,
  selectedFolderId:  null,
  isUnifiedInbox:    true,

  setSelectedAccount: (accountId) =>
    set({ selectedAccountId: accountId, selectedFolderId: null, isUnifiedInbox: false }),

  setSelectedFolder: (folderId, accountId = null) =>
    set({ selectedFolderId: folderId, selectedAccountId: accountId, isUnifiedInbox: false }),

  setUnifiedInbox: () =>
    set({ isUnifiedInbox: true, selectedAccountId: null, selectedFolderId: null }),

  // Selected message / thread
  selectedMessageId: null,
  selectedThreadId:  null,
  setSelectedMessage: (id) => set({ selectedMessageId: id, selectedThreadId: null }),
  setSelectedThread:  (id) => set({ selectedThreadId: id, selectedMessageId: null }),
  clearSelection: () => set({ selectedMessageId: null, selectedThreadId: null }),

  // Compose
  composeOpen:    false,
  composeMode:    'new',     // 'new' | 'reply' | 'reply_all' | 'forward'
  composeMessage: null,      // original message when replying/forwarding
  composeAccountId: null,

  openCompose: (mode = 'new', message = null, accountId = null) =>
    set({ composeOpen: true, composeMode: mode, composeMessage: message, composeAccountId: accountId }),

  closeCompose: () =>
    set({ composeOpen: false, composeMode: 'new', composeMessage: null, composeAccountId: null }),

  // Search
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),

  // Unread counts (keyed by folder id)
  unreadCounts: {},
  setUnreadCount: (folderId, count) =>
    set((s) => ({ unreadCounts: { ...s.unreadCounts, [folderId]: count } })),

  // New mail since timestamp (for polling)
  lastPollTime: null,
  setLastPollTime: (t) => set({ lastPollTime: t }),
}));

export default useEmailStore;
