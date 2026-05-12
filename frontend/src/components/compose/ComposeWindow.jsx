/**
 * @module components/compose/ComposeWindow
 * @fileoverview Floating compose window for new messages, replies, and forwards.
 *
 * Rendered as a fixed overlay at the bottom-right of the viewport. Supports
 * minimise/restore, Cc/Bcc field toggles, file attachment uploads with
 * progress tracking, HTML editing via a self-hosted TinyMCE instance, and
 * signature injection/switching. Pre-populates To, subject, and quoted body
 * from emailStore when opened in reply/forward mode.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import useEmailStore from '@/store/emailStore';
import useAuthStore  from '@/store/authStore';
import { useSendMessage } from '@/hooks/useMessages';
import { useAccounts } from '@/hooks/useAccounts';
import { getSignatures } from '@/api/signatures';
import { uploadAttachment } from '@/api/messages';
import { formatSize } from '@/utils/email';

const TINYMCE_INIT = {
  height: '100%',
  menubar: false,
  plugins: [
    'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
    'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
    'insertdatetime', 'media', 'table', 'code', 'help', 'wordcount',
  ],
  toolbar:
    'undo redo | formatselect | bold italic underline strikethrough | ' +
    'forecolor backcolor | alignleft aligncenter alignright | ' +
    'bullist numlist outdent indent | link image | removeformat | code',
  skin:                'oxide-dark',
  content_css:         'dark',
  body_class:          'cm-compose-body',
  content_style:       'body { font-family: system-ui, sans-serif; font-size: 14px; color: #e2e8f0; }',
  branding:            false,
  resize:              false,
  statusbar:           false,
  automatic_uploads:   false,
};

/**
 * Floating compose window component. Reads compose state (mode, original
 * message, account) from emailStore and manages all local form state. Does
 * not accept props — all configuration is passed through the store.
 * @returns {React.ReactElement}
 */
export default function ComposeWindow() {
  const { composeMode, composeMessage, composeAccountId, closeCompose } = useEmailStore();
  const user        = useAuthStore(s => s.user);
  const sendMsg     = useSendMessage();
  const { data: accounts = [] } = useAccounts();

  const [fromAccountId, setFromAccountId] = useState(composeAccountId || accounts[0]?.id || '');
  const [to,   setTo]   = useState('');
  const [cc,   setCc]   = useState('');
  const [bcc,  setBcc]  = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [showCc,   setShowCc]  = useState(false);
  const [showBcc,  setShowBcc] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading]     = useState(false);
  const [minimised, setMinimised]     = useState(false);
  const [signatures, setSignatures]   = useState([]);
  const [sigId, setSigId]             = useState(null);
  const fileRef = useRef(null);

  // Load signatures
  useEffect(() => {
    getSignatures().then(sigs => {
      setSignatures(sigs || []);
      const def = (sigs || []).find(s => s.is_default);
      if (def) {
        setSigId(def.id);
        setBodyHtml(prev => prev + '<br><br>--<br>' + def.html_content);
      }
    }).catch(() => {});
  }, []);

  // Pre-populate for reply/forward
  useEffect(() => {
    const msg = composeMessage;
    if (!msg) return;

    if (composeMode !== 'new') {
      setSubject(msg.subject || '');
      setBodyHtml(msg.bodyHtml || '');

      if (composeMode === 'reply') {
        setTo(msg.from_address || '');
      } else if (composeMode === 'reply_all') {
        const toAddrs = (msg.replyTo || []).map(a => a.email).join(', ');
        setTo(toAddrs);
      } else if (composeMode === 'forward') {
        setTo('');
      }
    }
  }, [composeMode, composeMessage]);

  // Set account
  useEffect(() => {
    if (composeAccountId) setFromAccountId(composeAccountId);
    else if (accounts.length) setFromAccountId(accounts[0].id);
  }, [composeAccountId, accounts]);

  const parseAddresses = (str) =>
    str.split(/[,;]+/)
       .map(s => s.trim())
       .filter(Boolean)
       .map(s => {
         const m = s.match(/^(.+?)\s*<(.+?)>$/);
         return m ? { name: m[1].trim(), email: m[2].trim() } : { name: '', email: s };
       });

  const handleSend = async () => {
    if (!to.trim()) { alert('Please add at least one recipient'); return; }
    if (!fromAccountId) { alert('Please select a send-from account'); return; }

    const toAddrs  = parseAddresses(to);
    const ccAddrs  = cc  ? parseAddresses(cc)  : [];
    const bccAddrs = bcc ? parseAddresses(bcc) : [];

    sendMsg.mutate({
      account_id:     parseInt(fromAccountId),
      to:             toAddrs,
      cc:             ccAddrs,
      bcc:            bccAddrs,
      subject,
      body_html:      bodyHtml,
      body_text:      '',
      attachment_ids: attachments.map(a => a.id),
      in_reply_to:    composeMessage?.message_id || null,
    });
  };

  const handleFileSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const att = await uploadAttachment(file);
        setAttachments(prev => [...prev, att]);
      }
    } catch (err) {
      alert('Upload failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAttachment = (id) => setAttachments(a => a.filter(att => att.id !== id));

  const fromAccount = accounts.find(a => a.id == fromAccountId);

  if (minimised) {
    return (
      <div className="fixed bottom-0 right-6 w-72 bg-surface-800 border border-slate-600 rounded-t-xl shadow-2xl z-50">
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => setMinimised(false)}>
          <span className="text-sm font-medium text-white truncate">{subject || 'New Message'}</span>
          <div className="flex items-center gap-1">
            <button onClick={e => { e.stopPropagation(); setMinimised(false); }} className="p-1 text-slate-400 hover:text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
            </button>
            <button onClick={e => { e.stopPropagation(); closeCompose(); }} className="p-1 text-slate-400 hover:text-red-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 right-6 w-[660px] h-[520px] bg-surface-800 border border-slate-600
                    rounded-t-xl shadow-2xl z-50 flex flex-col">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-700/50 rounded-t-xl shrink-0">
        <span className="text-sm font-medium text-white">
          {composeMode === 'reply'    ? 'Reply'
           : composeMode === 'reply_all' ? 'Reply All'
           : composeMode === 'forward'   ? 'Forward'
           : 'New Message'}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => setMinimised(true)}   className="p-1 text-slate-400 hover:text-white"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" /></svg></button>
          <button onClick={closeCompose}              className="p-1 text-slate-400 hover:text-red-400"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
        </div>
      </div>

      {/* Fields */}
      <div className="px-4 py-2 border-b border-slate-700/50 space-y-1 shrink-0 text-sm">
        {/* From */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500 w-16 shrink-0">From</span>
          <select
            value={fromAccountId}
            onChange={e => setFromAccountId(e.target.value)}
            className="flex-1 bg-transparent text-slate-200 focus:outline-none"
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.display_name} &lt;{a.email_address}&gt;</option>
            ))}
          </select>
        </div>
        <div className="border-t border-slate-700/30" />

        {/* To */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500 w-16 shrink-0">To</span>
          <input value={to} onChange={e => setTo(e.target.value)}
            className="flex-1 bg-transparent text-slate-200 focus:outline-none placeholder-slate-600"
            placeholder="recipient@example.com" />
          <div className="flex gap-1">
            {!showCc  && <button onClick={() => setShowCc(true)}  className="text-xs text-slate-500 hover:text-slate-300">Cc</button>}
            {!showBcc && <button onClick={() => setShowBcc(true)} className="text-xs text-slate-500 hover:text-slate-300">Bcc</button>}
          </div>
        </div>
        {showCc && (
          <>
            <div className="border-t border-slate-700/30" />
            <div className="flex items-center gap-2">
              <span className="text-slate-500 w-16 shrink-0">Cc</span>
              <input value={cc} onChange={e => setCc(e.target.value)}
                className="flex-1 bg-transparent text-slate-200 focus:outline-none placeholder-slate-600"
                placeholder="cc@example.com" />
            </div>
          </>
        )}
        {showBcc && (
          <>
            <div className="border-t border-slate-700/30" />
            <div className="flex items-center gap-2">
              <span className="text-slate-500 w-16 shrink-0">Bcc</span>
              <input value={bcc} onChange={e => setBcc(e.target.value)}
                className="flex-1 bg-transparent text-slate-200 focus:outline-none placeholder-slate-600"
                placeholder="bcc@example.com" />
            </div>
          </>
        )}
        <div className="border-t border-slate-700/30" />
        {/* Subject */}
        <div className="flex items-center gap-2">
          <span className="text-slate-500 w-16 shrink-0">Subject</span>
          <input value={subject} onChange={e => setSubject(e.target.value)}
            className="flex-1 bg-transparent text-slate-200 focus:outline-none placeholder-slate-600 font-medium"
            placeholder="Subject" />
        </div>
      </div>

      {/* TinyMCE editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          tinymceScriptSrc="/tinymce/tinymce.min.js"
          value={bodyHtml}
          onEditorChange={setBodyHtml}
          init={TINYMCE_INIT}
        />
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-700/50 flex flex-wrap gap-2 shrink-0">
          {attachments.map(att => (
            <div key={att.id} className="flex items-center gap-1.5 bg-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-300">
              <span className="truncate max-w-[140px]">{att.filename}</span>
              <span className="text-slate-500">{formatSize(att.size)}</span>
              <button onClick={() => removeAttachment(att.id)} className="text-slate-500 hover:text-red-400">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-700/50 shrink-0">
        <div className="flex items-center gap-2">
          {/* Attach file */}
          <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
            title="Attach file"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          {/* Signature selector */}
          {signatures.length > 0 && (
            <select
              value={sigId || ''}
              onChange={e => {
                const id = e.target.value ? parseInt(e.target.value) : null;
                setSigId(id);
                const sig = signatures.find(s => s.id == id);
                const base = bodyHtml.replace(/<br><br>--<br>[\s\S]*$/, '');
                setBodyHtml(sig ? base + '<br><br>--<br>' + sig.html_content : base);
              }}
              className="text-xs bg-slate-700 border-0 text-slate-300 rounded px-2 py-1 focus:outline-none"
            >
              <option value="">No signature</option>
              {signatures.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={sendMsg.isPending}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white
                     font-medium px-4 py-1.5 rounded-lg text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          {sendMsg.isPending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
