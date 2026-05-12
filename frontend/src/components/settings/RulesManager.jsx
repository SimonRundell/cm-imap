/**
 * @module components/settings/RulesManager
 * @fileoverview Settings panel for creating and managing email processing rules.
 *
 * Rules consist of one or more conditions (field/operator/value triples) combined
 * with AND/OR logic, plus one or more actions (move, label, mark read, etc.).
 * The RuleForm component handles both create and edit modes.
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccounts } from '@/api/accounts';
import { getRules, createRule, updateRule, deleteRule, getLabels } from '@/api/rules';
import { getAllFolders } from '@/api/folders';
import useUIStore from '@/store/uiStore';

const FIELDS = [
  { value: 'from_address', label: 'From (email)' },
  { value: 'from_name',    label: 'From (name)' },
  { value: 'to',           label: 'To' },
  { value: 'cc',           label: 'Cc' },
  { value: 'subject',      label: 'Subject' },
  { value: 'body',         label: 'Body' },
  { value: 'has_attachment', label: 'Has attachment' },
];
const OPERATORS = [
  { value: 'contains',     label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with',  label: 'starts with' },
  { value: 'ends_with',    label: 'ends with' },
  { value: 'equals',       label: 'equals' },
  { value: 'not_equals',   label: 'does not equal' },
];
const ACTION_TYPES = [
  { value: 'move_to_folder', label: 'Move to folder', hasValue: true },
  { value: 'add_label',      label: 'Add label',      hasValue: true },
  { value: 'mark_read',      label: 'Mark as read',   hasValue: false },
  { value: 'mark_starred',   label: 'Mark starred',   hasValue: false },
  { value: 'set_priority',   label: 'Set priority',   hasValue: true },
  { value: 'delete',         label: 'Delete',          hasValue: false },
  { value: 'move_to_spam',   label: 'Move to spam',   hasValue: false },
  { value: 'autoreply',      label: 'Auto-reply with', hasValue: true },
];

const newCondition = () => ({ field: 'from_address', operator: 'contains', value: '' });
const newAction    = () => ({ action_type: 'mark_read', action_value: '' });

/**
 * Rule create/edit form. Manages local state for conditions and actions and
 * builds the rule payload for the parent to persist.
 * @param {object} props
 * @param {object|null}       props.initial   - Existing rule data for edit mode, or null for create.
 * @param {number}            props.accountId - Account this rule belongs to.
 * @param {object[]}          props.folders   - All folders (used to populate the "move to folder" action select).
 * @param {object[]}          props.labels    - All labels for the selected account.
 * @param {function(object): void} props.onSave    - Called with the complete rule payload on submit.
 * @param {function(): void}  props.onCancel  - Called when the user cancels.
 * @param {boolean}           props.loading   - When true, the save button shows a saving state.
 * @returns {React.ReactElement}
 */
function RuleForm({ initial, accountId, folders, labels, onSave, onCancel, loading }) {
  const [name,     setName]     = useState(initial?.name || '');
  const [logic,    setLogic]    = useState(initial?.condition_logic || 'AND');
  const [priority, setPriority] = useState(initial?.priority ?? 10);
  const [stop,     setStop]     = useState(initial?.stop_processing ?? false);
  const [enabled,  setEnabled]  = useState(initial?.is_enabled ?? true);
  const [conditions, setConditions] = useState(initial?.conditions?.length ? initial.conditions : [newCondition()]);
  const [actions,    setActions]    = useState(initial?.actions?.length    ? initial.actions    : [newAction()]);

  const updateCondition = (i, k, v) => setConditions(c => c.map((c2, j) => j === i ? { ...c2, [k]: v } : c2));
  const updateAction    = (i, k, v) => setActions(a => a.map((a2, j) => j === i ? { ...a2, [k]: v } : a2));

  const accountFolders = folders.filter(f => f.account_id == accountId);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="label-sm">Rule Name</label>
          <input className="input-dark" value={name} onChange={e => setName(e.target.value)} placeholder="Filter newsletters" />
        </div>
        <div>
          <label className="label-sm">Priority</label>
          <input type="number" className="input-dark" value={priority} onChange={e => setPriority(parseInt(e.target.value))} min={1} max={100} />
        </div>
      </div>

      {/* Conditions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-300">Conditions</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Match:</span>
            {['AND','OR'].map(l => (
              <button key={l} onClick={() => setLogic(l)}
                className={`text-xs px-2 py-1 rounded ${logic === l ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <select className="input-dark flex-1" value={c.field} onChange={e => updateCondition(i, 'field', e.target.value)}>
              {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <select className="input-dark flex-1" value={c.operator} onChange={e => updateCondition(i, 'operator', e.target.value)}>
              {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input className="input-dark flex-1" value={c.value} onChange={e => updateCondition(i, 'value', e.target.value)} placeholder="value" />
            <button onClick={() => setConditions(c => c.filter((_, j) => j !== i))}
              className="text-slate-500 hover:text-red-400 p-1">✕</button>
          </div>
        ))}
        <button onClick={() => setConditions(c => [...c, newCondition()])}
          className="text-xs text-blue-400 hover:text-blue-300">+ Add condition</button>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <span className="text-sm font-medium text-slate-300">Actions</span>
        {actions.map((a, i) => {
          const aType    = ACTION_TYPES.find(t => t.value === a.action_type);
          const hasValue = aType?.hasValue;
          return (
            <div key={i} className="flex items-center gap-2">
              <select className="input-dark flex-1" value={a.action_type} onChange={e => updateAction(i, 'action_type', e.target.value)}>
                {ACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {hasValue && a.action_type === 'move_to_folder' && (
                <select className="input-dark flex-1" value={a.action_value || ''} onChange={e => updateAction(i, 'action_value', e.target.value)}>
                  <option value="">Select folder</option>
                  {accountFolders.map(f => <option key={f.id} value={f.full_path}>{f.name}</option>)}
                </select>
              )}
              {hasValue && a.action_type === 'add_label' && (
                <select className="input-dark flex-1" value={a.action_value || ''} onChange={e => updateAction(i, 'action_value', e.target.value)}>
                  <option value="">Select label</option>
                  {labels.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
                </select>
              )}
              {hasValue && a.action_type === 'set_priority' && (
                <select className="input-dark flex-1" value={a.action_value || '3'} onChange={e => updateAction(i, 'action_value', e.target.value)}>
                  {[1,2,3,4,5].map(p => <option key={p} value={p}>{p === 1 ? 'Highest' : p === 5 ? 'Lowest' : `Normal (${p})`}</option>)}
                </select>
              )}
              {hasValue && a.action_type === 'autoreply' && (
                <input className="input-dark flex-1" value={a.action_value || ''} onChange={e => updateAction(i, 'action_value', e.target.value)} placeholder="Reply body (HTML)" />
              )}
              <button onClick={() => setActions(a => a.filter((_, j) => j !== i))}
                className="text-slate-500 hover:text-red-400 p-1">✕</button>
            </div>
          );
        })}
        <button onClick={() => setActions(a => [...a, newAction()])}
          className="text-xs text-blue-400 hover:text-blue-300">+ Add action</button>
      </div>

      {/* Options */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          Rule enabled
        </label>
        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-300">
          <input type="checkbox" checked={stop} onChange={e => setStop(e.target.checked)} />
          Stop processing further rules
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
        <button disabled={loading} className="btn-primary"
          onClick={() => onSave({ name, condition_logic: logic, priority, stop_processing: stop, is_enabled: enabled, conditions, actions, account_id: accountId })}>
          {loading ? 'Saving…' : 'Save Rule'}
        </button>
      </div>
    </div>
  );
}

/**
 * Email rules management panel. Fetches rules, folders and labels for the
 * selected account and orchestrates create/update/delete with toast feedback.
 * @returns {React.ReactElement}
 */
export default function RulesManager() {
  const qc       = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [editId,  setEditId]  = useState(null);

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  const accountId = selectedAccount ? parseInt(selectedAccount) : null;

  useEffect(() => { if (accounts.length && !selectedAccount) setSelectedAccount(String(accounts[0].id)); }, [accounts]);

  const { data: rules   = [] } = useQuery({ queryKey: ['rules',   accountId], queryFn: () => getRules(accountId),    enabled: !!accountId });
  const { data: folders = [] } = useQuery({ queryKey: ['folders', 'all'],     queryFn: getAllFolders });
  const { data: labels  = [] } = useQuery({ queryKey: ['labels',  accountId], queryFn: () => getLabels(accountId), enabled: !!accountId });

  const createMut = useMutation({
    mutationFn: createRule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rules'] }); setShowNew(false); addToast('Rule created', 'success'); },
    onError: (e) => addToast(e.response?.data?.message || 'Save failed', 'error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateRule(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rules'] }); setEditId(null); addToast('Rule updated', 'success'); },
    onError: (e) => addToast(e.response?.data?.message || 'Update failed', 'error'),
  });
  const deleteMut = useMutation({
    mutationFn: deleteRule,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rules'] }); addToast('Rule deleted', 'success'); },
  });

  const editRule = rules.find(r => r.id === editId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Email Rules</h3>
          <p className="text-sm text-slate-400 mt-0.5">Automate email processing with conditions and actions</p>
        </div>
        {!showNew && !editId && accountId && (
          <button onClick={() => setShowNew(true)} className="btn-primary text-sm">+ New Rule</button>
        )}
      </div>

      <div>
        <label className="label-sm">Account</label>
        <select className="input-dark w-64" value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
        </select>
      </div>

      {showNew && accountId && (
        <div className="bg-surface-800 rounded-xl border border-slate-700 p-5">
          <h4 className="text-sm font-semibold text-white mb-4">New Rule</h4>
          <RuleForm accountId={accountId} folders={folders} labels={labels}
            onSave={d => createMut.mutate(d)} onCancel={() => setShowNew(false)} loading={createMut.isPending} />
        </div>
      )}

      {editId && editRule && (
        <div className="bg-surface-800 rounded-xl border border-slate-700 p-5">
          <h4 className="text-sm font-semibold text-white mb-4">Edit: {editRule.name}</h4>
          <RuleForm accountId={accountId} folders={folders} labels={labels} initial={editRule}
            onSave={d => updateMut.mutate({ id: editId, data: d })} onCancel={() => setEditId(null)} loading={updateMut.isPending} />
        </div>
      )}

      <div className="space-y-3">
        {rules.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No rules yet. Create one to automate email sorting.</p>
        ) : rules.map(rule => (
          <div key={rule.id} className={`bg-surface-800 rounded-xl border p-4 ${rule.is_enabled ? 'border-slate-700' : 'border-slate-700/40 opacity-60'}`}>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white text-sm">{rule.name}</span>
                  {!rule.is_enabled && <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full">Disabled</span>}
                  <span className="text-xs text-slate-500">Priority {rule.priority}</span>
                  <span className="text-xs text-slate-500">Logic: {rule.condition_logic}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {rule.conditions?.length} condition{rule.conditions?.length !== 1 ? 's' : ''} →{' '}
                  {rule.actions?.length} action{rule.actions?.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditId(rule.id); setShowNew(false); }} className="btn-ghost text-xs">Edit</button>
                <button onClick={() => { if (confirm('Delete rule?')) deleteMut.mutate(rule.id); }}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
