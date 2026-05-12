/**
 * @module store/uiStore
 * @fileoverview Zustand store for UI preferences and the toast notification queue.
 *
 * The sidebar state, preview pane width, theme and notification preference are
 * persisted to localStorage under "cm-imap-ui". The toast queue is ephemeral
 * and resets on page load.
 */
/**
 * @typedef {object} Toast
 * @property {number} id        - Unique timestamp-based ID used as React key and for removal.
 * @property {string} message   - Human-readable toast body.
 * @property {'info'|'success'|'error'|'warning'} type - Visual variant.
 * @property {number} duration  - Auto-dismiss delay in milliseconds.
 */
/**
 * @typedef {object} UIState
 * @property {boolean}  sidebarCollapsed  - Whether the left sidebar is hidden.
 * @property {number}   previewPaneWidth  - Width of the message preview pane as a percentage (0–100).
 * @property {'dark'}   theme             - Active colour theme (currently only "dark" is implemented).
 * @property {boolean}  notifications     - Whether browser desktop notifications are enabled.
 * @property {Toast[]}  toasts            - Ordered queue of active toast notifications.
 *
 * @property {function(): void}           toggleSidebar
 * @property {function(number): void}     setPreviewWidth
 * @property {function(string): void}     setTheme
 * @property {function(): void}           toggleNotifications
 * @property {function(string, string=, number=): number} addToast  - Enqueues a toast; returns its ID.
 * @property {function(number): void}     removeToast               - Removes a toast by ID immediately.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * UI preferences and toast store hook.
 * @returns {UIState} The full UI state slice including actions.
 */
const useUIStore = create(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      previewPaneWidth: 45,    // percentage
      theme:            'dark',
      notifications:    true,

      toggleSidebar:  () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setPreviewWidth: (w) => set({ previewPaneWidth: w }),
      setTheme:        (t) => set({ theme: t }),
      toggleNotifications: () => set((s) => ({ notifications: !s.notifications })),

      // Toast / alert system
      toasts: [],
      addToast: (message, type = 'info', duration = 4000) => {
        const id = Date.now();
        set((s) => ({ toasts: [...s.toasts, { id, message, type, duration }] }));
        setTimeout(() => {
          set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
        }, duration + 300);
        return id;
      },
      removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    }),
    {
      name: 'cm-imap-ui',
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        previewPaneWidth: s.previewPaneWidth,
        theme:            s.theme,
        notifications:    s.notifications,
      }),
    }
  )
);

export default useUIStore;
