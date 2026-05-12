/**
 * @module store/authStore
 * @fileoverview Zustand store for authentication state.
 *
 * The user, accessToken and refreshToken slices are persisted to localStorage
 * under the key "cm-imap-auth" so sessions survive page refreshes.
 * Token strings are also written directly to localStorage so that the Axios
 * client interceptor (which runs outside React) can read them synchronously.
 */
/**
 * @typedef {object} AuthState
 * @property {object|null}  user          - Authenticated user object (id, username, email, role) or null.
 * @property {string|null}  accessToken   - Current JWT access token.
 * @property {string|null}  refreshToken  - Current JWT refresh token.
 * @property {boolean}      isLoading     - True while an async auth operation is in-flight.
 * @property {function({user: object, access_token: string, refresh_token: string}): void} setAuth
 *   - Store tokens in both Zustand state and localStorage, and set the user record.
 * @property {function(): void}            clearAuth         - Wipe all auth state and remove tokens from localStorage.
 * @property {function(object): void}      setUser           - Replace the user record without touching tokens.
 * @property {function(): boolean}         isAdmin           - Returns true when the current user has the "admin" role.
 * @property {function(): boolean}         isAuthenticated   - Returns true when an access token is present.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Authentication store hook.
 * @returns {AuthState} The full auth slice including actions.
 */
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
