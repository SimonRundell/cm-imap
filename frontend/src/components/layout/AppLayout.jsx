/**
 * @module components/layout/AppLayout
 * @fileoverview Top-level authenticated layout shell.
 *
 * Renders the persistent Header, collapsible Sidebar, a React Router Outlet
 * for page content, the ComposeWindow overlay (when open), and the
 * ToastContainer. Also activates the background polling and notification
 * permission hooks for the duration of the session.
 */
import { useEffect, useCallback } from 'react';
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

  const composeOpen    = useEmailStore(s => s.composeOpen);
  const collapsed      = useUIStore(s => s.sidebarCollapsed);
  const sidebarWidth   = useUIStore(s => s.sidebarWidth);
  const setSidebarWidth = useUIStore(s => s.setSidebarWidth);

  const onSidebarDragStart = useCallback((e) => {
    e.preventDefault();
    const startX     = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (e) => {
      const next = Math.min(480, Math.max(160, startWidth + e.clientX - startX));
      setSidebarWidth(next);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor    = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor    = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth, setSidebarWidth]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-surface-900">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {!collapsed && (
          <>
            <div style={{ width: sidebarWidth, flexShrink: 0 }} className="border-r border-slate-700/50 h-full">
              <Sidebar />
            </div>
            <div
              onMouseDown={onSidebarDragStart}
              className="w-1 shrink-0 cursor-col-resize hover:bg-blue-500 bg-transparent transition-colors"
              title="Drag to resize sidebar"
            />
          </>
        )}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      {composeOpen && <ComposeWindow />}
      <ToastContainer />
    </div>
  );
}
