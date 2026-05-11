import { smartDate, formatAddress, getInitials } from '@/utils/email';
import useEmailStore from '@/store/emailStore';
import { useUpdateMessage } from '@/hooks/useMessages';

const PriorityDot = ({ priority }) => {
  if (priority === 1 || priority === 2)
    return <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="High priority" />;
  if (priority === 4 || priority === 5)
    return <span className="w-2 h-2 rounded-full bg-slate-600 shrink-0" title="Low priority" />;
  return null;
};

export default function MessageItem({ message, isSelected, onClick }) {
  const updateMsg = useUpdateMessage();

  const toggleStar = (e) => {
    e.stopPropagation();
    updateMsg.mutate({ id: message.id, data: { is_starred: !message.is_starred } });
  };

  const toggleRead = (e) => {
    e.stopPropagation();
    updateMsg.mutate({ id: message.id, data: { is_read: !message.is_read } });
  };

  const initials = getInitials(message.from_name, message.from_address);
  const subject  = message.subject || '(no subject)';
  const dateStr  = smartDate(message.date);

  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-slate-700/30
        ${isSelected ? 'bg-blue-600/20 border-l-2 border-l-blue-500' : 'hover:bg-slate-700/30'}
        ${!message.is_read && !isSelected ? 'bg-slate-800/30' : ''}`}
    >
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0
        ${!message.is_read ? 'bg-blue-600 text-white' : 'bg-slate-600 text-slate-300'}`}>
        {initials}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${!message.is_read ? 'font-semibold text-white' : 'text-slate-300'}`}>
            {message.from_name || message.from_address || 'Unknown'}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <PriorityDot priority={message.priority} />
            {message.has_attachments ? (
              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            ) : null}
            <span className="text-xs text-slate-500">{dateStr}</span>
          </div>
        </div>

        <p className={`text-sm truncate mt-0.5 ${!message.is_read ? 'text-slate-100 font-medium' : 'text-slate-400'}`}>
          {subject}
        </p>

        {/* Labels */}
        {message.labels?.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {message.labels.map(l => (
              <span key={l.id} className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{ backgroundColor: l.color + '33', color: l.color }}>
                {l.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions (visible on hover) */}
      <div className="flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
        <button onClick={toggleStar} title={message.is_starred ? 'Unstar' : 'Star'}
          className={`p-0.5 rounded ${message.is_starred ? 'text-yellow-400' : 'text-slate-600 hover:text-yellow-400'}`}>
          <svg className="w-4 h-4" fill={message.is_starred ? 'currentColor' : 'none'}
               viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
