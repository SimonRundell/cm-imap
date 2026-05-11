import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ToastContainer from '../common/ToastContainer';
import ComposeWindow from '../compose/ComposeWindow';
import useEmailStore from '@/store/emailStore';
import useUIStore    from '@/store/uiStore';
import { usePolling, useRequestNotificationPermission } from '@/hooks/usePolling';

export default function AppLayout() {
  usePolling();
  useRequestNotificationPermission();

  const composeOpen = useEmailStore(s => s.composeOpen);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface-900">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      {composeOpen && <ComposeWindow />}
      <ToastContainer />
    </div>
  );
}
