import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import * as messagesApi from '@/api/messages';
import useEmailStore from '@/store/emailStore';
import useUIStore    from '@/store/uiStore';

export function useMessages(params) {
  return useQuery({
    queryKey:  ['messages', params],
    queryFn:   () => messagesApi.getMessages(params),
    staleTime: 30_000,
    enabled:   true,
  });
}

export function useMessage(id) {
  return useQuery({
    queryKey:  ['message', id],
    queryFn:   () => messagesApi.getMessage(id),
    enabled:   !!id,
    staleTime: 60_000,
  });
}

export function useUpdateMessage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }) => messagesApi.updateMessage(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['message', id] });
      qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

export function useDeleteMessage() {
  const qc       = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const clearSel = useEmailStore(s => s.clearSelection);

  return useMutation({
    mutationFn: messagesApi.deleteMessage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      clearSel();
      addToast('Message moved to trash', 'info');
    },
    onError: () => addToast('Could not delete message', 'error'),
  });
}

export function useMoveMessage() {
  const qc       = useQueryClient();
  const addToast = useUIStore(s => s.addToast);

  return useMutation({
    mutationFn: ({ id, folderId }) => messagesApi.moveMessage(id, folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      addToast('Message moved', 'success');
    },
    onError: () => addToast('Move failed', 'error'),
  });
}

export function useSendMessage() {
  const qc       = useQueryClient();
  const addToast = useUIStore(s => s.addToast);
  const closeCompose = useEmailStore(s => s.closeCompose);

  return useMutation({
    mutationFn: messagesApi.sendMessage,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      closeCompose();
      addToast('Message sent', 'success');
    },
    onError: (e) => addToast(e.response?.data?.message || 'Send failed', 'error'),
  });
}

export function useUpdateLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, labelIds }) => messagesApi.updateMessageLabels(id, labelIds),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['message', id] });
      qc.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}
