import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
