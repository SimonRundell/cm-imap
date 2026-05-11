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

function RequireAuth({ children }) {
  const isAuth = useAuthStore(s => s.isAuthenticated());
  if (!isAuth) return <Navigate to="/login" replace />;
  return children;
}

function RequireGuest({ children }) {
  const isAuth = useAuthStore(s => s.isAuthenticated());
  if (isAuth) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
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
