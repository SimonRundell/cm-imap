import MessageList    from '@/components/inbox/MessageList';
import MessagePreview from '@/components/inbox/MessagePreview';
import useUIStore     from '@/store/uiStore';
import useEmailStore  from '@/store/emailStore';

export default function InboxPage() {
  const previewWidth   = useUIStore(s => s.previewPaneWidth);
  const selectedId     = useEmailStore(s => s.selectedMessageId);

  return (
    <div className="h-full flex overflow-hidden">
      {/* Message list */}
      <div style={{ width: selectedId ? `${100 - previewWidth}%` : '100%' }} className="transition-all duration-150">
        <MessageList />
      </div>

      {/* Preview pane */}
      {selectedId && (
        <div style={{ width: `${previewWidth}%` }} className="border-l border-slate-700/50 overflow-hidden">
          <MessagePreview />
        </div>
      )}
    </div>
  );
}
