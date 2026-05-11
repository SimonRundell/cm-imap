import { useState } from 'react';
import AccountSettings  from '@/components/settings/AccountSettings';
import SignatureEditor  from '@/components/settings/SignatureEditor';
import AutoreplySettings from '@/components/settings/AutoreplySettings';
import RulesManager     from '@/components/settings/RulesManager';
import LabelsManager    from '@/components/settings/LabelsManager';

const TABS = [
  { id: 'accounts',   label: 'Accounts',   icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { id: 'signatures', label: 'Signatures', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  { id: 'autoreply',  label: 'Auto-Reply', icon: 'M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6' },
  { id: 'rules',      label: 'Rules',      icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
  { id: 'labels',     label: 'Labels',     icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
];

const PANELS = {
  accounts:   AccountSettings,
  signatures: SignatureEditor,
  autoreply:  AutoreplySettings,
  rules:      RulesManager,
  labels:     LabelsManager,
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('accounts');
  const Panel = PANELS[activeTab];

  return (
    <div className="h-full flex overflow-hidden">
      {/* Sidebar nav */}
      <nav className="w-48 shrink-0 border-r border-slate-700/50 bg-surface-800 p-3 space-y-1">
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
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto">
          <Panel />
        </div>
      </div>
    </div>
  );
}
