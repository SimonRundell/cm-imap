/**
 * @module hooks/useAccounts
 * @fileoverview TanStack Query hooks for accounts and folders.
 *
 * Provides data-fetching, sync, and deletion mutations for email accounts
 * and IMAP folders, with automatic cache invalidation and toast feedback.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as accountsApi from '@/api/accounts';
import * as foldersApi  from '@/api/folders';
import useEmailStore from '@/store/emailStore';
import useUIStore    from '@/store/uiStore';

/**
 * Fetch the authenticated user's email accounts and synchronise the result
 * into emailStore so components that read `accounts` from the store stay current.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useAccounts() {
  const setAccounts = useEmailStore(s => s.setAccounts);

  return useQuery({
    queryKey: ['accounts'],
    queryFn:  async () => {
      const data = await accountsApi.getAccounts();
      setAccounts(data || []);
      return data;
    },
    staleTime: 60_000,
  });
}

/**
 * Fetch folders for a single account, or all folders when accountId is falsy.
 * @param {number|null} accountId - Account to filter by, or null/undefined for all.
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useFolders(accountId) {
  return useQuery({
    queryKey: ['folders', accountId],
    queryFn:  () => accountId ? foldersApi.getFolders(accountId) : foldersApi.getAllFolders(),
    staleTime: 30_000,
  });
}

/**
 * Fetch all folders across every account owned by the current user.
 * Useful for cross-account UI (e.g. "Move to folder" dropdown).
 * @returns {import('@tanstack/react-query').UseQueryResult<object[]>}
 */
export function useAllFolders() {
  return useQuery({
    queryKey: ['folders', 'all'],
    queryFn:  foldersApi.getAllFolders,
    staleTime: 30_000,
  });
}

/**
 * Mutation hook that triggers an immediate IMAP sync for one account.
 * On success, invalidates the messages and folders queries and shows a toast
 * with the count of newly fetched messages.
 * @returns {import('@tanstack/react-query').UseMutationResult<object, Error, number>}
 *   Call `.mutate(accountId)` with the account ID to trigger a sync.
 */
export function useSyncAccount() {
  const qc       = useQueryClient();
  const addToast = useUIStore(s => s.addToast);

  return useMutation({
    mutationFn: accountsApi.syncAccount,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['messages'] });
      qc.invalidateQueries({ queryKey: ['folders'] });
      addToast(`Sync complete — ${data?.new_messages ?? 0} new messages`, 'success');
    },
    onError: (e) => addToast(e.response?.data?.message || 'Sync failed', 'error'),
  });
}

/**
 * Mutation hook that permanently deletes an email account and all its mail.
 * On success, invalidates the accounts and folders queries and shows a toast.
 * @returns {import('@tanstack/react-query').UseMutationResult<object, Error, number>}
 *   Call `.mutate(accountId)` with the account ID to delete.
 */
export function useDeleteAccount() {
  const qc       = useQueryClient();
  const addToast = useUIStore(s => s.addToast);

  return useMutation({
    mutationFn: accountsApi.deleteAccount,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['folders'] });
      addToast('Account removed', 'success');
    },
    onError: (e) => addToast(e.response?.data?.message || 'Delete failed', 'error'),
  });
}
