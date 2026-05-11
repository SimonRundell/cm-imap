import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Editor } from '@tinymce/tinymce-react';
import { getSignatures, createSignature, updateSignature, deleteSignature } from '@/api/signatures';
import { getAccounts } from '@/api/accounts';
import useUIStore from '@/store/uiStore';

const TINYMCE_INIT = {
  height: 220,
  menubar: false,
  plugins: ['advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'code'],
  toolbar: 'bold italic underline | forecolor backcolor | alignleft aligncenter | link image | code',
  skin: 'oxide-dark', content_css: 'dark',
  content_style: 'body { font-family: system-ui, sans-serif; font-size: 13px; color: #e2e8f0; }',
  branding: false, statusbar: false, resize: false,
};

function SigForm({ initial, accounts, onSave, onCancel, loading }) {
  const [name,      setName]      = useState(initial?.name || '');
  const [html,      setHtml]      = useState(initial?.html_content || '');
  const [accountId, setAccountId] = useState(initial?.account_id || '');
  const [isDefault, setIsDefault] = useState(initial?.is_default || false);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-sm">Signature Name</label>
          <input className="input-dark" required value={name} onChange={e => setName(e.target.value)} placeholder="Default, Work…" />
        </div>
        <div>
          <label className="label-sm">Account (optional)</label>
          <select className="input-dark" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">All accounts</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="label-sm">Signature HTML</label>
        <Editor
          tinymceScriptSrc="/tinymce/tinymce.min.js"
          value={html}
          onEditorChange={setHtml}
          init={TINYMCE_INIT}
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={isDefault} onChange={e => setIsDefault(e.target.checked)}
          className="rounded border-slate-600" />
        <span className="text-sm text-slate-300">Use as default signature</span>
      </label>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
        <button onClick={() => onSave({ name, html_content: html, account_id: accountId || null, is_default: isDefault })}
          disabled={loading} className="btn-primary">
          {loading ? 'Saving…' : 'Save Signature'}
        </button>
      </div>
    </div>
  );
}

export default function SignatureEditor() {
  const qc       = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const [editId, setEditId]   = useState(null);
  const [showNew, setShowNew] = useState(false);

  const { data: sigs     = [] } = useQuery({ queryKey: ['signatures'],   queryFn: getSignatures });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'],     queryFn: getAccounts });

  const createMut = useMutation({
    mutationFn: createSignature,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['signatures'] }); setShowNew(false); addToast('Signature saved', 'success'); },
    onError:   () => addToast('Save failed', 'error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateSignature(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['signatures'] }); setEditId(null); addToast('Signature updated', 'success'); },
    onError:   () => addToast('Update failed', 'error'),
  });
  const deleteMut = useMutation({
    mutationFn: deleteSignature,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['signatures'] }); addToast('Signature deleted', 'success'); },
  });

  const editSig = sigs.find(s => s.id === editId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Email Signatures</h3>
          <p className="text-sm text-slate-400 mt-0.5">Create HTML signatures with images and formatting</p>
        </div>
        {!showNew && !editId && (
          <button onClick={() => setShowNew(true)} className="btn-primary text-sm">+ New Signature</button>
        )}
      </div>

      {showNew && (
        <div className="bg-surface-800 rounded-xl border border-slate-700 p-5">
          <h4 className="text-sm font-semibold text-white mb-4">New Signature</h4>
          <SigForm accounts={accounts} onSave={d => createMut.mutate(d)} onCancel={() => setShowNew(false)} loading={createMut.isPending} />
        </div>
      )}

      {editId && editSig && (
        <div className="bg-surface-800 rounded-xl border border-slate-700 p-5">
          <h4 className="text-sm font-semibold text-white mb-4">Edit: {editSig.name}</h4>
          <SigForm accounts={accounts} initial={editSig}
            onSave={d => updateMut.mutate({ id: editId, data: d })}
            onCancel={() => setEditId(null)} loading={updateMut.isPending} />
        </div>
      )}

      <div className="space-y-3">
        {sigs.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No signatures yet.</p>
        ) : sigs.map(sig => (
          <div key={sig.id} className="bg-surface-800 rounded-xl border border-slate-700 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-white text-sm">{sig.name}</span>
                  {sig.is_default && <span className="text-xs bg-blue-600/30 text-blue-400 px-2 py-0.5 rounded-full">Default</span>}
                  {sig.account_id && <span className="text-xs text-slate-500">Account-specific</span>}
                </div>
                <div className="mt-2 p-3 bg-surface-900 rounded-lg text-sm text-slate-400 max-h-24 overflow-hidden"
                     dangerouslySetInnerHTML={{ __html: sig.html_content }} />
              </div>
              <div className="flex gap-1 ml-3 shrink-0">
                <button onClick={() => { setEditId(sig.id); setShowNew(false); }} className="btn-ghost text-xs">Edit</button>
                <button onClick={() => { if (confirm('Delete signature?')) deleteMut.mutate(sig.id); }}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
