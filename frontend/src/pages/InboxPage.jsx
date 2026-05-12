/**
 * @module pages/InboxPage
 * @fileoverview Main inbox page — side-by-side message list and preview pane.
 *
 * The list fills the full width when no message is selected. When a message is
 * selected, the pane widths are driven by uiStore.previewPaneWidth (default 45%)
 * so the user's resizing preference is remembered across sessions.
 */
import MessageList    from '@/components/inbox/MessageList';
import MessagePreview from '@/components/inbox/MessagePreview';
import useUIStore     from '@/store/uiStore';
import useEmailStore  from '@/store/emailStore';

/**
 * Inbox page component. Lays out the MessageList alongside an optional
 * MessagePreview pane whose width is controlled by uiStore.previewPaneWidth.
 * @returns {React.ReactElement}
 */
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
