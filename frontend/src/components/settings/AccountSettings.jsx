import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccounts, createAccount, updateAccount, deleteAccount, testAccount, syncAccount } from '@/api/accounts';
import { syncFolders } from '@/api/folders';
import useUIStore from '@/store/uiStore';

const EMPTY_FORM = {
  display_name: '', email_address: '',
  imap_host: '', imap_port: 993, imap_encryption: 'ssl', imap_username: '', imap_password: '',
  smtp_host: '', smtp_port: 587, smtp_encryption: 'starttls', smtp_username: '', smtp_password: '',
};

function AccountForm({ initial, onSave, onCancel, loading }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const encOptions = ['ssl', 'tls', 'starttls', 'none'];

  return (
    <form onSubmit={e => { e.preventDefault(); onSave(form); }} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label-sm">Display Name</label>
          <input className="input-dark" required value={form.display_name} onChange={e => set('display_name', e.target.value)} placeholder="Personal Gmail" />
        </div>
        <div className="col-span-2">
          <label className="label-sm">Email Address</label>
          <input className="input-dark" type="email" required value={form.email_address} onChange={e => set('email_address', e.target.value)} placeholder="you@example.com" />
        </div>
      </div>

      {/* IMAP */}
      <div className="border border-slate-700 rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-semibold text-slate-300">IMAP (Incoming)</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label-sm">Server</label>
            <input className="input-dark" required value={form.imap_host} onChange={e => set('imap_host', e.target.value)} placeholder="imap.gmail.com" />
          </div>
          <div>
            <label className="label-sm">Port</label>
            <input className="input-dark" type="number" required value={form.imap_port} onChange={e => set('imap_port', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">Encryption</label>
            <select className="input-dark" value={form.imap_encryption} onChange={e => set('imap_encryption', e.target.value)}>
              {encOptions.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">Username</label>
            <input className="input-dark" required value={form.imap_username} onChange={e => set('imap_username', e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <label className="label-sm">Password {initial ? '(leave blank to keep)' : ''}</label>
            <input className="input-dark" type="password" required={!initial} value={form.imap_password} onChange={e => set('imap_password', e.target.value)} placeholder="••••••••" />
          </div>
        </div>
      </div>

      {/* SMTP */}
      <div className="border border-slate-700 rounded-xl p-4 space-y-3">
        <h4 className="text-sm font-semibold text-slate-300">SMTP (Outgoing)</h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label-sm">Server</label>
            <input className="input-dark" required value={form.smtp_host} onChange={e => set('smtp_host', e.target.value)} placeholder="smtp.gmail.com" />
          </div>
          <div>
            <label className="label-sm">Port</label>
            <input className="input-dark" type="number" required value={form.smtp_port} onChange={e => set('smtp_port', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">Encryption</label>
            <select className="input-dark" value={form.smtp_encryption} onChange={e => set('smtp_encryption', e.target.value)}>
              {encOptions.map(o => <option key={o} value={o}>{o.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label-sm">Username</label>
            <input className="input-dark" required value={form.smtp_username} onChange={e => set('smtp_username', e.target.value)} placeholder="you@example.com" />
          </div>
          <div>
            <label className="label-sm">Password {initial ? '(leave blank to keep)' : ''}</label>
            <input className="input-dark" type="password" required={!initial} value={form.smtp_password} onChange={e => set('smtp_password', e.target.value)} placeholder="••••••••" />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>
        <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Saving…' : 'Save Account'}</button>
      </div>
    </form>
  );
}

export default function AccountSettings() {
  const qc       = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [testing,  setTesting]  = useState({});
  const [syncing,  setSyncing]  = useState({});

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn:  getAccounts,
  });

  const createMut = useMutation({
    mutationFn: createAccount,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setShowForm(false); addToast('Account added', 'success'); },
    onError: (e) => addToast(e.response?.data?.message || 'Failed to add account', 'error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateAccount(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setEditId(null); addToast('Account updated', 'success'); },
    onError: (e) => addToast(e.response?.data?.message || 'Update failed', 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); addToast('Account removed', 'success'); },
    onError: (e) => addToast(e.response?.data?.message || 'Delete failed', 'error'),
  });

  const handleTest = async (id, type) => {
    setTesting(t => ({ ...t, [`${id}-${type}`]: true }));
    try {
      const r = await testAccount(id, type);
      addToast(r.message, 'success');
    } catch (e) {
      addToast(e.response?.data?.message || 'Test failed', 'error');
    } finally {
      setTesting(t => ({ ...t, [`${id}-${type}`]: false }));
    }
  };

  const handleSync = async (id) => {
    setSyncing(s => ({ ...s, [id]: true }));
    try {
      await syncAccount(id);
      await syncFolders(id);
      qc.invalidateQueries({ queryKey: ['folders'] });
      addToast('Sync complete', 'success');
    } catch (e) {
      addToast(e.response?.data?.message || 'Sync failed', 'error');
    } finally {
      setSyncing(s => ({ ...s, [id]: false }));
    }
  };

  const editAccount = accounts.find(a => a.id === editId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Email Accounts</h3>
          <p className="text-sm text-slate-400 mt-0.5">Add and manage your IMAP/SMTP accounts</p>
        </div>
        {!showForm && !editId && (
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">+ Add Account</button>
        )}
      </div>

      {(showForm) && (
        <div className="bg-surface-800 rounded-xl border border-slate-700 p-5">
          <h4 className="text-sm font-semibold text-white mb-4">Add New Account</h4>
          <AccountForm
            onSave={(data) => createMut.mutate(data)}
            onCancel={() => setShowForm(false)}
            loading={createMut.isPending}
          />
        </div>
      )}

      {editId && editAccount && (
        <div className="bg-surface-800 rounded-xl border border-slate-700 p-5">
          <h4 className="text-sm font-semibold text-white mb-4">Edit: {editAccount.display_name}</h4>
          <AccountForm
            initial={editAccount}
            onSave={(data) => updateMut.mutate({ id: editId, data })}
            onCancel={() => setEditId(null)}
            loading={updateMut.isPending}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p className="text-sm">No accounts added yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map(acc => (
            <div key={acc.id} className="bg-surface-800 rounded-xl border border-slate-700 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white">{acc.display_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${acc.is_active ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-500'}`}>
                      {acc.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400">{acc.email_address}</p>
                  <p className="text-xs text-slate-600 mt-1">
                    IMAP: {acc.imap_host}:{acc.imap_port} · SMTP: {acc.smtp_host}:{acc.smtp_port}
                  </p>
                  {acc.last_sync && <p className="text-xs text-slate-600">Last sync: {new Date(acc.last_sync).toLocaleString()}</p>}
                  {acc.sync_error && <p className="text-xs text-red-400 mt-1">Error: {acc.sync_error}</p>}
                </div>
                <div className="flex items-center gap-1 flex-wrap">
                  <button onClick={() => handleTest(acc.id, 'imap')} disabled={testing[`${acc.id}-imap`]}
                    className="btn-ghost text-xs">
                    {testing[`${acc.id}-imap`] ? '…' : 'Test IMAP'}
                  </button>
                  <button onClick={() => handleTest(acc.id, 'smtp')} disabled={testing[`${acc.id}-smtp`]}
                    className="btn-ghost text-xs">
                    {testing[`${acc.id}-smtp`] ? '…' : 'Test SMTP'}
                  </button>
                  <button onClick={() => handleSync(acc.id)} disabled={syncing[acc.id]}
                    className="btn-ghost text-xs">
                    {syncing[acc.id] ? 'Syncing…' : 'Sync Now'}
                  </button>
                  <button onClick={() => { setEditId(acc.id); setShowForm(false); }} className="btn-ghost text-xs">Edit</button>
                  <button onClick={() => { if (confirm('Delete this account and all its emails?')) deleteMut.mutate(acc.id); }}
                    className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
