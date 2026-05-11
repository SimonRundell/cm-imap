import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, createUser, updateUser, deleteUser } from '@/api/admin';
import useUIStore    from '@/store/uiStore';
import useAuthStore  from '@/store/authStore';

function UserForm({ initial, onSave, onCancel, loading }) {
  const [form, setForm] = useState({
    username: initial?.username || '',
    email:    initial?.email    || '',
    password: '',
    role:     initial?.role     || 'user',
    is_active: initial?.is_active ?? 1,
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label-sm">Username</label>
          <input className="input-dark" required value={form.username} onChange={e => set('username', e.target.value)} />
        </div>
        <div>
          <label className="label-sm">Email</label>
          <input className="input-dark" type="email" required value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
        <div>
          <label className="label-sm">Password {initial ? '(blank = no change)' : ''}</label>
          <input className="input-dark" type="password" required={!initial} value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" />
        </div>
        <div>
          <label className="label-sm">Role</label>
          <select className="input-dark" value={form.role} onChange={e => set('role', e.target.value)}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      {initial && (
        <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
          <input type="checkbox" checked={!!form.is_active} onChange={e => set('is_active', e.target.checked ? 1 : 0)} />
          Account active
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
        <button disabled={loading} className="btn-primary" onClick={() => onSave(form)}>
          {loading ? 'Saving…' : initial ? 'Update User' : 'Create User'}
        </button>
      </div>
    </div>
  );
}

export default function UserManager() {
  const qc        = useQueryClient();
  const addToast  = useUIStore(s => s.addToast);
  const currentId = useAuthStore(s => s.user?.id);
  const [showNew, setShowNew] = useState(false);
  const [editId,  setEditId]  = useState(null);

  const { data: users = [], isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: getUsers });

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setShowNew(false); addToast('User created', 'success'); },
    onError: (e) => addToast(e.response?.data?.message || 'Create failed', 'error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateUser(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setEditId(null); addToast('User updated', 'success'); },
    onError: (e) => addToast(e.response?.data?.message || 'Update failed', 'error'),
  });
  const deleteMut = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); addToast('User deleted', 'success'); },
    onError: (e) => addToast(e.response?.data?.message || 'Delete failed', 'error'),
  });

  const editUser = users.find(u => u.id === editId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Users</h3>
          <p className="text-sm text-slate-400 mt-0.5">Manage user accounts and roles</p>
        </div>
        {!showNew && !editId && (
          <button onClick={() => setShowNew(true)} className="btn-primary text-sm">+ Create User</button>
        )}
      </div>

      {showNew && (
        <div className="bg-surface-800 rounded-xl border border-slate-700 p-5">
          <h4 className="text-sm font-semibold text-white mb-4">New User</h4>
          <UserForm onSave={d => createMut.mutate(d)} onCancel={() => setShowNew(false)} loading={createMut.isPending} />
        </div>
      )}

      {editId && editUser && (
        <div className="bg-surface-800 rounded-xl border border-slate-700 p-5">
          <h4 className="text-sm font-semibold text-white mb-4">Edit: {editUser.username}</h4>
          <UserForm initial={editUser} onSave={d => updateMut.mutate({ id: editId, data: d })} onCancel={() => setEditId(null)} loading={updateMut.isPending} />
        </div>
      )}

      {isLoading ? (
        <p className="text-slate-500 text-sm">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="pb-3 pr-4">User</th>
                <th className="pb-3 pr-4">Role</th>
                <th className="pb-3 pr-4">Accounts</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Joined</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {users.map(u => (
                <tr key={u.id} className="text-slate-300">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-white">{u.username}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-slate-700 text-slate-400'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 pr-4">{u.account_count}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${u.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {u.is_active ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-slate-500 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="py-3">
                    <div className="flex gap-1">
                      <button onClick={() => { setEditId(u.id); setShowNew(false); }} className="btn-ghost text-xs">Edit</button>
                      {u.id !== currentId && (
                        <button onClick={() => { if (confirm(`Delete user "${u.username}" and all their data?`)) deleteMut.mutate(u.id); }}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
