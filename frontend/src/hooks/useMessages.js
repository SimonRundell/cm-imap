/**
 * @module hooks/useMessages
 * @fileoverview TanStack Query hooks for fetching and mutating email messages.
 *
 * Covers list queries, single-message fetch, read/starred flag updates,
 * delete, move, send, and label mutations — each with cache invalidation
 * and toast feedback where appropriate.
 */
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import * as messagesApi from '@/api/messages';
import useEmailStore from '@/store/emailStore';
import useUIStore    from '@/store/uiStore';

/**
 * Fetch a paginated message list. The query key includes the full params
 * object so any filter change triggers a fresh fetch.
 * @param {object} params - Filter/pagination options (folder_id, account_id, unified, search, page, per_page).
 * @returns {import('@tanstack/react-query').UseQueryResult<{messages: object[], total: number, last_page: number}>}
 */
export function useMessages(params) {
  return useQuery({
    queryKey:  ['messages', params],
    queryFn:   () => messagesApi.getMessages(params),
    staleTime: 30_000,
    enabled:   true,
  });
}

/**
 * Fetch a single message by ID, including its full HTML/text body and attachments.
 * The query is disabled when id is falsy.
 * @param {number|null} id - Message ID.
 * @returns {import('@tanstack/react-query').UseQueryResult<object>}
 */
export function useMessage(id) {
  return useQuery({
    queryKey:  ['message', id],
    queryFn:   () => messagesApi.getMessage(id),
    enabled:   !!id,
    staleTime: 60_000,
  });
}

/**
 * Mutation to patch mutable message fields such as is_read and is_starred.
 * Invalidates both the single-message and the list query on success.
 * @returns {import('@tanstack/react-query').UseMutationResult<object, Error, {id: number, data: object}>}
 */
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

/**
 * Mutation to delete (trash) a message. Clears the current selection in
 * emailStore and refreshes the message list on success.
 * @returns {import('@tanstack/react-query').UseMutationResult<object, Error, number>}
 *   Call `.mutate(messageId)`.
 */
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

/**
 * Mutation to move a message to a different folder.
 * @returns {import('@tanstack/react-query').UseMutationResult<object, Error, {id: number, folderId: number}>}
 */
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

/**
 * Mutation to send an outgoing email. On success, closes the compose window,
 * shows a success toast, and invalidates the messages list.
 * @returns {import('@tanstack/react-query').UseMutationResult<object, Error, object>}
 *   Call `.mutate(messagePayload)` — see {@link module:api/messages.sendMessage} for the payload shape.
 */
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

/**
 * Mutation to replace the complete set of labels on a message.
 * @returns {import('@tanstack/react-query').UseMutationResult<object, Error, {id: number, labelIds: number[]}>}
 */
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
