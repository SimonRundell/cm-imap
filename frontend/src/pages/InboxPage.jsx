/**
 * @module pages/InboxPage
 * @fileoverview Main inbox page — side-by-side message list and preview pane.
 *
 * The list fills the full width when no message is selected. When a message is
 * selected, the pane widths are driven by uiStore.previewPaneWidth (default 45%)
 * so the user's resizing preference is remembered across sessions.
 */
import { useRef, useCallback } from 'react';
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
  const setPreviewWidth = useUIStore(s => s.setPreviewWidth);
  const selectedId     = useEmailStore(s => s.selectedMessageId);
  const containerRef   = useRef(null);

  const onPreviewDragStart = useCallback((e) => {
    e.preventDefault();

    const onMouseMove = (e) => {
      const rect = containerRef.current.getBoundingClientRect();
      const x    = e.clientX - rect.left;
      const next = Math.min(70, Math.max(20, Math.round((1 - x / rect.width) * 100)));
      setPreviewWidth(next);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor    = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor    = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [setPreviewWidth]);

  return (
    <div ref={containerRef} className="h-full flex overflow-hidden">
      {/* Message list */}
      <div style={{ width: selectedId ? `${100 - previewWidth}%` : '100%' }}>
        <MessageList />
      </div>

      {/* Preview pane + drag handle */}
      {selectedId && (
        <>
          <div
            onMouseDown={onPreviewDragStart}
            className="w-1 shrink-0 cursor-col-resize hover:bg-blue-500 bg-slate-700/50 transition-colors"
            title="Drag to resize preview"
          />
          <div style={{ width: `${previewWidth}%` }} className="overflow-hidden">
            <MessagePreview />
          </div>
        </>
      )}
    </div>
  );
}
