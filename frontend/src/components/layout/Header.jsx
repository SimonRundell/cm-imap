import { useNavigate } from 'react-router-dom';
import useAuthStore  from '@/store/authStore';
import useUIStore    from '@/store/uiStore';
import useEmailStore from '@/store/emailStore';
import { logout as apiLogout } from '@/api/auth';

export default function Header() {
  const navigate      = useNavigate();
  const { user, refreshToken, clearAuth } = useAuthStore();
  const toggleSidebar = useUIStore(s => s.toggleSidebar);
  const searchQuery   = useEmailStore(s => s.searchQuery);
  const setSearch     = useEmailStore(s => s.setSearchQuery);
  const isAdmin       = useAuthStore(s => s.isAdmin());
  const syncAccount   = useEmailStore(s => s.selectedAccountId);
  const openCompose   = useEmailStore(s => s.openCompose);

  const handleLogout = async () => {
    try { await apiLogout(refreshToken); } catch {}
    clearAuth();
    navigate('/login');
  };

  return (
    <header className="h-14 flex items-center gap-3 px-4 bg-surface-800 border-b border-slate-700/50 shrink-0">
      {/* Sidebar toggle */}
      <button
        onClick={toggleSidebar}
        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* App name */}
      <span className="text-slate-300 font-semibold text-sm hidden sm:block">CM-IMAP</span>

      {/* Search */}
      <div className="flex-1 max-w-xl relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none"
             fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          placeholder="Search emails…"
          value={searchQuery}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-surface-900 border border-slate-600 rounded-lg pl-9 pr-3 py-1.5 text-sm
                     text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {/* Compose button (mobile) */}
        <button
          onClick={() => openCompose()}
          className="sm:hidden p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>

        {/* Settings */}
        <button
          onClick={() => navigate('/settings')}
          className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          title="Settings"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Admin */}
        {isAdmin && (
          <button
            onClick={() => navigate('/admin')}
            className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            title="Admin panel"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </button>
        )}

        {/* User avatar + logout */}
        <div className="relative group ml-1">
          <button className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white">
            {user?.username?.[0]?.toUpperCase() || 'U'}
          </button>
          <div className="absolute right-0 top-full mt-1 w-48 bg-surface-800 border border-slate-700
                          rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible
                          transition-all z-50">
            <div className="px-3 py-2 border-b border-slate-700">
              <p className="text-sm font-medium text-white">{user?.username}</p>
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-300 hover:text-red-400
                         hover:bg-slate-700/50 rounded-b-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
