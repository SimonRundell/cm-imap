import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as accountsApi from '@/api/accounts';
import * as foldersApi  from '@/api/folders';
import useEmailStore from '@/store/emailStore';
import useUIStore    from '@/store/uiStore';

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

export function useFolders(accountId) {
  return useQuery({
    queryKey: ['folders', accountId],
    queryFn:  () => accountId ? foldersApi.getFolders(accountId) : foldersApi.getAllFolders(),
    staleTime: 30_000,
  });
}

export function useAllFolders() {
  return useQuery({
    queryKey: ['folders', 'all'],
    queryFn:  foldersApi.getAllFolders,
    staleTime: 30_000,
  });
}

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
