/**
 * @module components/settings/AutoreplySettings
 * @fileoverview Settings panel for configuring per-account automatic replies.
 *
 * Lets the user pick an account, then toggle the auto-reply on/off, set an
 * optional date range, edit the subject, and compose the reply body via
 * TinyMCE. Saves via upsert so create and update share the same action.
 */
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Editor } from '@tinymce/tinymce-react';
import { getAccounts } from '@/api/accounts';
import { getAutoreply, upsertAutoreply } from '@/api/rules';
import useUIStore from '@/store/uiStore';

const TINYMCE_INIT = {
  height: 200, menubar: false, plugins: ['lists', 'link', 'code'],
  toolbar: 'bold italic | link | code',
  skin: 'oxide-dark', content_css: 'dark',
  content_style: 'body { font-family: system-ui; font-size:13px; color:#e2e8f0; }',
  branding: false, statusbar: false, resize: false, license_key: 'gpl',
};

/**
 * Auto-reply settings panel. Loads the existing auto-reply record when an
 * account is selected and persists changes via the upsertAutoreply API.
 * @returns {React.ReactElement}
 */
export default function AutoreplySettings() {
  const qc       = useQueryClient();
  const addToast = useUIStore(s => s.addToast);

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: getAccounts });
  const [selectedAccount, setSelectedAccount] = useState('');

  const accountId = selectedAccount ? parseInt(selectedAccount) : null;

  const { data: ar, isLoading } = useQuery({
    queryKey: ['autoreply', accountId],
    queryFn:  () => getAutoreply(accountId),
    enabled:  !!accountId,
  });

  const [enabled,    setEnabled]    = useState(false);
  const [subject,    setSubject]    = useState('');
  const [body,       setBody]       = useState('');
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');

  useEffect(() => {
    if (ar) {
      setEnabled(!!ar.is_enabled);
      setSubject(ar.subject || '');
      setBody(ar.html_body || '');
      setStartDate(ar.start_date || '');
      setEndDate(ar.end_date || '');
    } else if (!ar && accountId) {
      setEnabled(false); setSubject(''); setBody(''); setStartDate(''); setEndDate('');
    }
  }, [ar, accountId]);

  // Auto-set account
  useEffect(() => {
    if (accounts.length && !selectedAccount) setSelectedAccount(String(accounts[0].id));
  }, [accounts]);

  const saveMut = useMutation({
    mutationFn: () => upsertAutoreply({
      account_id: accountId,
      is_enabled: enabled,
      subject,
      html_body:  body,
      start_date: startDate || null,
      end_date:   endDate   || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['autoreply', accountId] });
      addToast('Autoreply settings saved', 'success');
    },
    onError: (e) => addToast(e.response?.data?.message || 'Save failed', 'error'),
  });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold text-white">Auto-Reply</h3>
        <p className="text-sm text-slate-400 mt-0.5">Send automatic replies when you're away</p>
      </div>

      {/* Account selector */}
      <div>
        <label className="label-sm">Account</label>
        <select className="input-dark w-64" value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.display_name} &lt;{a.email_address}&gt;</option>)}
        </select>
      </div>

      {accountId && (
        <div className="bg-surface-800 rounded-xl border border-slate-700 p-5 space-y-4">
          {/* Enable toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div onClick={() => setEnabled(e => !e)}
              className={`relative w-10 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
            </div>
            <span className="text-sm font-medium text-white">
              {enabled ? 'Auto-reply is ON' : 'Auto-reply is OFF'}
            </span>
          </label>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label-sm">Start Date (optional)</label>
              <input type="date" className="input-dark" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="label-sm">End Date (optional)</label>
              <input type="date" className="input-dark" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label-sm">Subject</label>
            <input className="input-dark" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Out of Office: {original subject}" />
          </div>

          <div>
            <label className="label-sm">Message</label>
            <Editor tinymceScriptSrc="/tinymce/tinymce.min.js" value={body} onEditorChange={setBody} init={TINYMCE_INIT} />
          </div>

          <p className="text-xs text-slate-500">
            Auto-replies are sent once per sender per account to avoid reply loops.
          </p>

          <div className="flex justify-end">
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-primary">
              {saveMut.isPending ? 'Saving…' : 'Save Auto-Reply Settings'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
