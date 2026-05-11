import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings, getSyncStatus } from '@/api/admin';
import useUIStore from '@/store/uiStore';

export default function SystemSettings() {
  const qc       = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const [form, setForm] = useState({});
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const { data: settings = {}, isLoading } = useQuery({ queryKey: ['admin-settings'], queryFn: getSettings });
  const { data: syncStatus = [] } = useQuery({ queryKey: ['admin-sync-status'], queryFn: getSyncStatus });

  useEffect(() => { setForm(settings); }, [settings]);

  const saveMut = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-settings'] }); addToast('Settings saved', 'success'); },
    onError: () => addToast('Save failed', 'error'),
  });

  if (isLoading) return <p className="text-slate-500 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white">System Settings</h3>
        <p className="text-sm text-slate-400 mt-0.5">Global configuration for the CM-IMAP installation</p>
      </div>

      <div className="bg-surface-800 rounded-xl border border-slate-700 p-5 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label-sm">Application Name</label>
            <input className="input-dark" value={form.app_name || ''} onChange={e => set('app_name', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Attachment Storage Path</label>
            <input className="input-dark font-mono text-xs" value={form.attachment_path || ''} onChange={e => set('attachment_path', e.target.value)} placeholder="/var/www/cm-imap-attachments" />
          </div>
          <div>
            <label className="label-sm">Max Attachment Size (MB)</label>
            <input className="input-dark" type="number" min={1} max={100} value={form.max_attachment_size_mb || 25} onChange={e => set('max_attachment_size_mb', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Sync Interval (minutes)</label>
            <input className="input-dark" type="number" min={1} max={60} value={form.sync_interval_minutes || 5} onChange={e => set('sync_interval_minutes', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Session Lifetime (hours)</label>
            <input className="input-dark" type="number" min={1} max={720} value={form.session_lifetime_hours || 24} onChange={e => set('session_lifetime_hours', e.target.value)} />
          </div>
          <div>
            <label className="label-sm">Allow Self-Registration</label>
            <select className="input-dark" value={form.allow_registration || '1'} onChange={e => set('allow_registration', e.target.value)}>
              <option value="1">Yes</option>
              <option value="0">No (admin-only)</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button disabled={saveMut.isPending} onClick={() => saveMut.mutate(form)} className="btn-primary">
            {saveMut.isPending ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </div>

      {/* Sync status */}
      <div>
        <h4 className="text-sm font-semibold text-white mb-3">Account Sync Status</h4>
        <div className="bg-surface-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Last Sync</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {syncStatus.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-500 text-xs">No accounts</td></tr>
              ) : syncStatus.map(acc => (
                <tr key={acc.id} className="text-slate-300">
                  <td className="px-4 py-3 text-xs">{acc.username}</td>
                  <td className="px-4 py-3">
                    <div className="text-sm">{acc.display_name}</div>
                    <div className="text-xs text-slate-500">{acc.email_address}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {acc.last_sync ? new Date(acc.last_sync).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3">
                    {acc.sync_error
                      ? <span className="text-xs text-red-400 truncate block max-w-xs" title={acc.sync_error}>Error: {acc.sync_error.substring(0, 60)}</span>
                      : <span className="text-xs text-green-400">OK</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
