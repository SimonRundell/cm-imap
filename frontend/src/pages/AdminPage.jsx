/**
 * @module pages/AdminPage
 * @fileoverview Admin control panel page — accessible only to users with the "admin" role.
 *
 * Displays an access-denied message with a redirect button for non-admins.
 * For admins, renders a sidebar-tabbed layout with a Users tab (UserManager)
 * and a Settings tab (SystemSettings), plus a "Back to Inbox" shortcut.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UserManager    from '@/components/admin/UserManager';
import SystemSettings from '@/components/admin/SystemSettings';
import useAuthStore   from '@/store/authStore';

const TABS = [
  { id: 'users',    label: 'Users',    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { id: 'settings', label: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
];

const PANELS = { users: UserManager, settings: SystemSettings };

/**
 * Admin panel page. Enforces the admin role client-side (server also enforces
 * it on every API call). Renders a two-tab layout: Users and Settings.
 * @returns {React.ReactElement}
 */
export default function AdminPage() {
  const navigate   = useNavigate();
  const isAdmin    = useAuthStore(s => s.isAdmin());
  const [activeTab, setActiveTab] = useState('users');

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        <div className="text-center">
          <p className="text-lg font-semibold text-white mb-2">Access Denied</p>
          <p className="text-sm mb-4">Admin access required.</p>
          <button onClick={() => navigate('/')} className="btn-primary">Go to Inbox</button>
        </div>
      </div>
    );
  }

  const Panel = PANELS[activeTab];

  return (
    <div className="h-full flex overflow-hidden">
      <nav className="w-48 shrink-0 border-r border-slate-700/50 bg-surface-800 p-3 space-y-1">
        <div className="px-3 py-2 mb-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin Panel</p>
        </div>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-left transition-colors
              ${activeTab === tab.id
                ? 'bg-blue-600 text-white font-medium'
                : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            {tab.label}
          </button>
        ))}
        <div className="pt-4 border-t border-slate-700/50">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-500 hover:text-white w-full">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Inbox
          </button>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          <Panel />
        </div>
      </div>
    </div>
  );
}
