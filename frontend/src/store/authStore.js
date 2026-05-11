import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set, get) => ({
      user:          null,
      accessToken:   null,
      refreshToken:  null,
      isLoading:     false,

      setAuth: ({ user, access_token, refresh_token }) => {
        localStorage.setItem('access_token',  access_token);
        localStorage.setItem('refresh_token', refresh_token);
        set({ user, accessToken: access_token, refreshToken: refresh_token });
      },

      clearAuth: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        set({ user: null, accessToken: null, refreshToken: null });
      },

      setUser: (user) => set({ user }),

      isAdmin: () => get().user?.role === 'admin',

      isAuthenticated: () => !!get().accessToken,
    }),
    {
      name: 'cm-imap-auth',
      partialize: (state) => ({
        user:         state.user,
        accessToken:  state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

export default useAuthStore;
