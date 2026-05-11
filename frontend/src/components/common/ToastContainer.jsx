import useUIStore from '@/store/uiStore';

const ICONS = {
  success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  error:   'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
  info:    'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
};
const COLORS = {
  success: 'border-green-500/30 text-green-400',
  error:   'border-red-500/30 text-red-400',
  info:    'border-blue-500/30 text-blue-400',
  warning: 'border-yellow-500/30 text-yellow-400',
};

export default function ToastContainer() {
  const toasts      = useUIStore(s => s.toasts);
  const removeToast = useUIStore(s => s.removeToast);

  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-start gap-3 bg-surface-800 border rounded-xl px-4 py-3 shadow-xl
                      pointer-events-auto animate-in slide-in-from-right ${COLORS[toast.type] || COLORS.info}`}
        >
          <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[toast.type] || ICONS.info} />
          </svg>
          <p className="text-sm text-slate-200 flex-1">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="text-slate-500 hover:text-slate-300 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
