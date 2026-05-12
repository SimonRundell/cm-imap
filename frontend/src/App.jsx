/**
 * @module App
 * @fileoverview Root application component. Sets up the TanStack Query client,
 * React Router, and the two route guard helpers, then declares all top-level routes:
 *
 * - /login, /register  — public, redirect to / when already authenticated
 * - /                  — protected; renders AppLayout with InboxPage as the index
 * - /settings          — protected; renders SettingsPage inside AppLayout
 * - /admin             — protected; renders AdminPage inside AppLayout
 * - *                  — catch-all redirect to /
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AppLayout   from '@/components/layout/AppLayout';
import LoginForm   from '@/components/auth/LoginForm';
import RegisterForm from '@/components/auth/RegisterForm';
import InboxPage   from '@/pages/InboxPage';
import SettingsPage from '@/pages/SettingsPage';
import AdminPage   from '@/pages/AdminPage';
import useAuthStore from '@/store/authStore';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

/**
 * Route guard that redirects unauthenticated visitors to /login.
 * @param {object} props
 * @param {React.ReactNode} props.children - The route element to render when authenticated.
 * @returns {React.ReactNode}
 */
function RequireAuth({ children }) {
  const isAuth = useAuthStore(s => s.isAuthenticated());
  if (!isAuth) return <Navigate to="/login" replace />;
  return children;
}

/**
 * Route guard that redirects already-authenticated users away from
 * public-only routes (login, register) back to the inbox.
 * @param {object} props
 * @param {React.ReactNode} props.children - The route element to render when not authenticated.
 * @returns {React.ReactNode}
 */
function RequireGuest({ children }) {
  const isAuth = useAuthStore(s => s.isAuthenticated());
  if (isAuth) return <Navigate to="/" replace />;
  return children;
}

/**
 * Root application component.
 * Provides the TanStack Query context and React Router, then renders the route tree.
 * @returns {React.ReactElement}
 */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<RequireGuest><LoginForm /></RequireGuest>} />
          <Route path="/register" element={<RequireGuest><RegisterForm /></RequireGuest>} />

          {/* Protected */}
          <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route index      element={<InboxPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="admin"    element={<AdminPage />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
