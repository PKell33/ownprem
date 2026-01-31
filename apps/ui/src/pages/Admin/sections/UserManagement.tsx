import { useState, useEffect } from 'react';
import { Plus, Trash2, User, Shield, Loader2, AlertCircle, Key, ShieldCheck, ShieldOff } from 'lucide-react';
import { api, UserInfo } from '../../../api/client';
import { showError } from '../../../lib/toast';
import CreateUserModal from '../modals/CreateUserModal';

interface UserManagementProps {
  currentUserId?: string;
}

export default function UserManagement({ currentUserId }: UserManagementProps) {
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [resettingTotp, setResettingTotp] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
      return;
    }

    try {
      await api.deleteUser(userId);
      setUsers(users.filter(u => u.id !== userId));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete user');
    }
  };

  const handleResetTotp = async (userId: string, username: string) => {
    if (!confirm(`Reset 2FA for user "${username}"? They will need to set up 2FA again on their next login.`)) {
      return;
    }

    try {
      setResettingTotp(userId);
      await api.resetUserTotp(userId);
      setUsers(users.map(u => u.id === userId ? { ...u, totp_enabled: false } : u));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to reset 2FA');
    } finally {
      setResettingTotp(null);
    }
  };

  const handleUserCreated = (user: UserInfo) => {
    setUsers([...users, user]);
    setShowCreateModal(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Users</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Add User
        </button>
      </div>

      {showCreateModal && (
        <CreateUserModal
          onSuccess={handleUserCreated}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted" />
          </div>
        ) : error ? (
          <div className="p-4 flex items-center gap-3 text-red-600 dark:text-red-400">
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-muted">
            No users found
          </div>
        ) : (
          <table className="w-full">
            <thead className="table-header">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted">User</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted">Access</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted">2FA</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted">Created</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted">Last Login</th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-color)]">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-[var(--bg-secondary)]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[var(--bg-tertiary)] rounded-full flex items-center justify-center">
                        <User size={16} className="text-muted" />
                      </div>
                      <span className="font-medium">{user.username}</span>
                      {user.id === currentUserId && (
                        <span className="text-xs bg-blue-600 px-2 py-0.5 rounded text-white">You</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {user.is_system_admin ? (
                      <div className="flex items-center gap-2">
                        <Shield size={14} className="text-yellow-500" />
                        <span className="text-yellow-500">System Admin</span>
                      </div>
                    ) : user.groups?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {user.groups.slice(0, 2).map(g => (
                          <span key={g.groupId} className="text-xs px-2 py-0.5 rounded bg-[var(--bg-tertiary)]">
                            {g.groupName}: {g.role}
                          </span>
                        ))}
                        {user.groups.length > 2 && (
                          <span className="text-xs text-muted">+{user.groups.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-muted text-sm">No groups</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {user.totp_enabled ? (
                      <div className="flex items-center gap-1.5 text-green-500">
                        <ShieldCheck size={14} />
                        <span className="text-sm">Enabled</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-muted">
                        <ShieldOff size={14} />
                        <span className="text-sm">Disabled</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted text-sm">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted text-sm">
                    {user.last_login_at
                      ? new Date(user.last_login_at).toLocaleString()
                      : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {user.id !== currentUserId && user.totp_enabled && (
                        <button
                          onClick={() => handleResetTotp(user.id, user.username)}
                          disabled={resettingTotp === user.id}
                          className="p-2 text-muted hover:text-yellow-500 hover:bg-[var(--bg-tertiary)] rounded transition-colors disabled:opacity-50"
                          aria-label={`Reset 2FA for ${user.username}`}
                        >
                          {resettingTotp === user.id ? (
                            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Key size={16} aria-hidden="true" />
                          )}
                        </button>
                      )}
                      {user.id !== currentUserId && (
                        <button
                          onClick={() => handleDeleteUser(user.id, user.username)}
                          className="p-2 text-muted hover:text-red-500 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                          aria-label={`Delete user ${user.username}`}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
