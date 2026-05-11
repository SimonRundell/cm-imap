import { useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { pollNewMessages } from '@/api/messages';
import useEmailStore from '@/store/emailStore';
import useUIStore from '@/store/uiStore';
import useAuthStore from '@/store/authStore';

const POLL_INTERVAL = 60_000; // 60 seconds

export function usePolling() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated());
  const lastPollTime    = useEmailStore(s => s.lastPollTime);
  const setLastPollTime = useEmailStore(s => s.setLastPollTime);
  const notifications   = useUIStore(s => s.notifications);
  const addToast        = useUIStore(s => s.addToast);
  const notifiedIds     = useRef(new Set());

  const since = lastPollTime || new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data } = useQuery({
    queryKey:  ['poll', 'new-messages'],
    queryFn:   () => pollNewMessages(since),
    enabled:   isAuthenticated,
    refetchInterval: POLL_INTERVAL,
    staleTime: POLL_INTERVAL - 1000,
  });

  useEffect(() => {
    if (!data?.new_messages?.length) return;

    const truly = data.new_messages.filter(m => !notifiedIds.current.has(m.id));
    if (!truly.length) return;

    truly.forEach(m => notifiedIds.current.add(m.id));
    setLastPollTime(new Date().toISOString());

    if (notifications && 'Notification' in window && Notification.permission === 'granted') {
      truly.slice(0, 3).forEach(m => {
        new Notification(`New email from ${m.from_name || m.from_address}`, {
          body:    m.subject || '(no subject)',
          icon:    '/mail-icon.svg',
          tag:     `cm-imap-${m.id}`,
        });
      });
    }

    if (truly.length === 1) {
      const m = truly[0];
      addToast(`New email from ${m.from_name || m.from_address}: ${m.subject || '(no subject)'}`, 'info', 6000);
    } else {
      addToast(`${truly.length} new emails received`, 'info', 5000);
    }
  }, [data]);
}

export function useRequestNotificationPermission() {
  const notifications = useUIStore(s => s.notifications);

  useEffect(() => {
    if (notifications && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, [notifications]);
}
