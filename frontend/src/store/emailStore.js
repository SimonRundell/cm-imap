/**
 * @module store/emailStore
 * @fileoverview Zustand store for email client UI state.
 *
 * Tracks which account/folder/message the user has selected, whether the
 * unified inbox view is active, compose-window state, the current search
 * query, per-folder unread counts, and the last poll timestamp.
 * This store is NOT persisted — it resets on page reload so the user always
 * starts at the unified inbox.
 */
/**
 * @typedef {object} EmailState
 * @property {object[]}     accounts          - Cached list of the user's email accounts (populated by useAccounts hook).
 * @property {object[]}     folders           - Cached list of all folders (populated by useAllFolders hook).
 * @property {number|null}  selectedAccountId - ID of the account currently focused in the sidebar, or null for unified view.
 * @property {number|null}  selectedFolderId  - ID of the folder currently open, or null.
 * @property {boolean}      isUnifiedInbox    - True when the "All Inboxes" combined view is active.
 * @property {number|null}  selectedMessageId - ID of the message open in the preview pane, or null.
 * @property {number|null}  selectedThreadId  - ID of the thread open (currently unused), or null.
 * @property {boolean}      composeOpen       - Whether the compose window is visible.
 * @property {'new'|'reply'|'reply_all'|'forward'} composeMode - Current compose mode.
 * @property {object|null}  composeMessage    - Original message object when replying or forwarding, null for new messages.
 * @property {number|null}  composeAccountId  - Account to send from, pre-selected when opening compose.
 * @property {string}       searchQuery       - Current search string typed by the user.
 * @property {Object.<number, number>} unreadCounts - Map of folder ID → unread count badge value.
 * @property {string|null}  lastPollTime      - ISO timestamp of the most recent successful new-mail poll.
 *
 * @property {function(object[]): void} setAccounts
 * @property {function(object[]): void} setFolders
 * @property {function(number): void}   setSelectedAccount
 * @property {function(number, number=): void} setSelectedFolder
 * @property {function(): void}          setUnifiedInbox
 * @property {function(number): void}   setSelectedMessage
 * @property {function(number): void}   setSelectedThread
 * @property {function(): void}          clearSelection
 * @property {function(string=, object=, number=): void} openCompose
 * @property {function(): void}          closeCompose
 * @property {function(string): void}   setSearchQuery
 * @property {function(number, number): void} setUnreadCount
 * @property {function(string): void}   setLastPollTime
 */
import { create } from 'zustand';

/**
 * Email client store hook.
 * @returns {EmailState} The full email state slice including actions.
 */
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
