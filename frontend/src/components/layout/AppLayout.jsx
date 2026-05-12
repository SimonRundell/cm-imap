/**
 * @module components/layout/AppLayout
 * @fileoverview Top-level authenticated layout shell.
 *
 * Renders the persistent Header, collapsible Sidebar, a React Router Outlet
 * for page content, the ComposeWindow overlay (when open), and the
 * ToastContainer. Also activates the background polling and notification
 * permission hooks for the duration of the session.
 */
import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import ToastContainer from '../common/ToastContainer';
import ComposeWindow from '../compose/ComposeWindow';
import useEmailStore from '@/store/emailStore';
import useUIStore    from '@/store/uiStore';
import { usePolling, useRequestNotificationPermission } from '@/hooks/usePolling';

/**
 * Authenticated application shell component.
 * Mounts the polling/notification side-effects and composes the page layout.
 * @returns {React.ReactElement}
 */
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
