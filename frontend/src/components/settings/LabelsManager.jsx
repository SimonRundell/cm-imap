/**
 * @module components/settings/LabelsManager
 * @fileoverview Settings panel for creating, editing, and deleting colour-coded message labels.
 *
 * Labels are per-account. The panel shows a colour-swatch picker, a name input,
 * and a live list of existing labels with inline edit mode.
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccounts } from '@/api/accounts';
import { getLabels, createLabel, updateLabel, deleteLabel } from '@/api/rules';
import useUIStore from '@/store/uiStore';

const PRESET_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280',
];

/**
 * Labels management panel. Scopes labels to the selected account and
 * supports create, inline-edit, and delete with toast feedback.
 * @returns {React.ReactElement}
 */
export default function LabelsManager() {
  const qc       = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [newName,  setNewName]  = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [editId,   setEditId]   = useState(null);
  const [editData, setEditData] = useState({});

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  useEffect(() => { if (accounts.length && !selectedAccount) setSelectedAccount(String(accounts[0].id)); }, [accounts]);

  const accountId = selectedAccount ? parseInt(selectedAccount) : null;

  const { data: labels = [] } = useQuery({
    queryKey: ['labels', accountId],
    queryFn:  () => getLabels(accountId),
    enabled:  !!accountId,
  });

  const createMut = useMutation({
    mutationFn: createLabel,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['labels'] }); setNewName(''); addToast('Label created', 'success'); },
    onError: () => addToast('Failed to create label', 'error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateLabel(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['labels'] }); setEditId(null); addToast('Label updated', 'success'); },
  });
  const deleteMut = useMutation({
    mutationFn: deleteLabel,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['labels'] }); addToast('Label deleted', 'success'); },
  });

  const handleCreate = () => {
    if (!newName.trim() || !accountId) return;
    createMut.mutate({ account_id: accountId, name: newName.trim(), color: newColor });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white">Labels</h3>
        <p className="text-sm text-slate-400 mt-0.5">Organise emails with colour-coded labels</p>
      </div>

      <div>
        <label className="label-sm">Account</label>
        <select className="input-dark w-64" value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
        </select>
      </div>

      {accountId && (
        <>
          {/* Create new label */}
          <div className="bg-surface-800 rounded-xl border border-slate-700 p-4">
            <h4 className="text-sm font-semibold text-white mb-3">New Label</h4>
            <div className="flex items-center gap-3">
              <input
                className="input-dark flex-1"
                value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Label name" onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <div className="flex gap-1.5 flex-wrap">
                {PRESET_COLORS.map(c => (
                  <button key={c} onClick={() => setNewColor(c)}
                    className={`w-6 h-6 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-white/50' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <button onClick={handleCreate} disabled={!newName.trim() || createMut.isPending}
                className="btn-primary text-sm shrink-0">
                {createMut.isPending ? '…' : 'Create'}
              </button>
            </div>
          </div>

          {/* Label list */}
          <div className="space-y-2">
            {labels.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No labels yet.</p>
            ) : labels.map(label => (
              <div key={label.id} className="flex items-center justify-between bg-surface-800 rounded-xl border border-slate-700 px-4 py-3">
                {editId === label.id ? (
                  <div className="flex items-center gap-3 flex-1">
                    <input className="input-dark flex-1" value={editData.name || ''} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} />
                    <div className="flex gap-1.5">
                      {PRESET_COLORS.map(c => (
                        <button key={c} onClick={() => setEditData(d => ({ ...d, color: c }))}
                          className={`w-5 h-5 rounded-full ${(editData.color || label.color) === c ? 'ring-2 ring-white/50 scale-110' : ''}`}
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                    <button onClick={() => updateMut.mutate({ id: label.id, data: editData })} className="btn-primary text-xs">Save</button>
                    <button onClick={() => setEditId(null)} className="btn-ghost text-xs">Cancel</button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: label.color }} />
                      <span className="text-sm text-white">{label.name}</span>
                      {label.message_count > 0 && (
                        <span className="text-xs text-slate-500">{label.message_count} message{label.message_count !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditId(label.id); setEditData({ name: label.name, color: label.color }); }}
                        className="btn-ghost text-xs">Edit</button>
                      <button onClick={() => { if (confirm('Delete label? This will remove it from all messages.')) deleteMut.mutate(label.id); }}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded">Delete</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
