import { useState, useEffect } from 'react';
import { Plus, Trash2, User, Shield, Loader2, AlertCircle, UserPlus, UserMinus } from 'lucide-react';
import { api, UserInfo, Group, GroupWithMembers } from '../../../api/client';
import { showError } from '../../../lib/toast';
import CreateGroupModal from '../modals/CreateGroupModal';
import AddMemberModal from '../modals/AddMemberModal';
import type { GroupRole } from '../types';

export default function GroupManagement() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<GroupWithMembers | null>(null);
  const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);

  const fetchGroups = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getGroups();
      setGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupDetails = async (groupId: string) => {
    try {
      const data = await api.getGroup(groupId);
      setSelectedGroup(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load group details');
    }
  };

  const fetchAllUsers = async () => {
    try {
      const data = await api.getUsers();
      setAllUsers(data);
    } catch {
      // Ignore - users might not have permission
    }
  };

  useEffect(() => {
    fetchGroups();
    fetchAllUsers();
  }, []);

  const handleCreateGroup = async (name: string, description: string, totpRequired: boolean) => {
    try {
      const newGroup = await api.createGroup(name, description, totpRequired);
      setGroups([...groups, newGroup]);
      setShowCreateModal(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to create group');
    }
  };

  const handleUpdateGroup = async (groupId: string, totpRequired: boolean) => {
    try {
      await api.updateGroup(groupId, { totpRequired });
      setGroups(groups.map(g => g.id === groupId ? { ...g, totp_required: totpRequired } : g));
      if (selectedGroup?.id === groupId) {
        setSelectedGroup({ ...selectedGroup, totp_required: totpRequired });
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update group');
    }
  };

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (groupId === 'default') {
      showError('Cannot delete the default group');
      return;
    }
    if (!confirm(`Delete group "${groupName}"? Members will be removed from this group.`)) {
      return;
    }
    try {
      await api.deleteGroup(groupId);
      setGroups(groups.filter(g => g.id !== groupId));
      if (selectedGroup?.id === groupId) {
        setSelectedGroup(null);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete group');
    }
  };

  const handleAddMember = async (userId: string, role: GroupRole) => {
    if (!selectedGroup) return;
    try {
      await api.addUserToGroup(selectedGroup.id, userId, role);
      await fetchGroupDetails(selectedGroup.id);
      setShowAddMemberModal(false);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add member');
    }
  };

  const handleUpdateMemberRole = async (userId: string, role: GroupRole) => {
    if (!selectedGroup) return;
    try {
      await api.updateUserGroupRole(selectedGroup.id, userId, role);
      await fetchGroupDetails(selectedGroup.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleRemoveMember = async (userId: string, username: string) => {
    if (!selectedGroup) return;
    if (!confirm(`Remove "${username}" from this group?`)) return;
    try {
      await api.removeUserFromGroup(selectedGroup.id, userId);
      await fetchGroupDetails(selectedGroup.id);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  // Filter out users who are already members OR are system admins
  const nonMembers = allUsers.filter(u =>
    !selectedGroup?.members.some(m => m.userId === u.id) && !u.is_system_admin
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Groups</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          New Group
        </button>
      </div>

      {showCreateModal && (
        <CreateGroupModal
          onSubmit={handleCreateGroup}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Groups List */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 table-header border-b border-[var(--border-color)]">
            <h3 className="font-medium">All Groups</h3>
          </div>
          {loading ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted" />
            </div>
          ) : error ? (
            <div className="p-4 flex items-center gap-3 text-red-600 dark:text-red-400">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          ) : groups.length === 0 ? (
            <div className="p-8 text-center text-muted">No groups found</div>
          ) : (
            <div className="divide-y divide-[var(--border-color)]" role="listbox" aria-label="Groups">
              {groups.map(group => (
                <button
                  key={group.id}
                  type="button"
                  role="option"
                  aria-selected={selectedGroup?.id === group.id}
                  className={`w-full text-left p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-inset ${
                    selectedGroup?.id === group.id
                      ? 'bg-blue-50 dark:bg-blue-600/20 border-l-2 border-blue-500'
                      : 'hover:bg-[var(--bg-secondary)]'
                  }`}
                  onClick={() => fetchGroupDetails(group.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        {group.name}
                        {group.id === 'default' && (
                          <span className="text-xs bg-[var(--bg-tertiary)] text-muted px-2 py-0.5 rounded">Default</span>
                        )}
                      </div>
                      <div className="text-sm text-muted">{group.description || 'No description'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {group.totp_required && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-600/30 dark:text-yellow-400 px-2 py-0.5 rounded flex items-center gap-1">
                          <Shield size={12} aria-hidden="true" />
                          2FA Required
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Group Details */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 table-header border-b border-[var(--border-color)] flex items-center justify-between">
            <h3 className="font-medium">
              {selectedGroup ? selectedGroup.name : 'Select a group'}
            </h3>
            {selectedGroup && selectedGroup.id !== 'default' && (
              <button
                onClick={() => handleDeleteGroup(selectedGroup.id, selectedGroup.name)}
                className="p-1.5 text-muted hover:text-red-500 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
                aria-label={`Delete group ${selectedGroup.name}`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {selectedGroup ? (
            <div className="p-4 space-y-4">
              {/* Group Settings */}
              <div className="flex items-center justify-between p-3 bg-[var(--bg-secondary)] rounded-lg">
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-muted" />
                  <span className="text-sm">Require 2FA for members</span>
                </div>
                {selectedGroup.id === 'default' ? (
                  <span className="text-xs text-muted">Not available for default group</span>
                ) : (
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedGroup.totp_required}
                      onChange={(e) => handleUpdateGroup(selectedGroup.id, e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                )}
              </div>

              {/* Members */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-muted">Members ({selectedGroup.members.length})</h4>
                  <button
                    onClick={() => setShowAddMemberModal(true)}
                    className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400"
                  >
                    <UserPlus size={14} />
                    Add Member
                  </button>
                </div>

                {showAddMemberModal && nonMembers.length > 0 && (
                  <AddMemberModal
                    users={nonMembers}
                    onAdd={handleAddMember}
                    onClose={() => setShowAddMemberModal(false)}
                  />
                )}

                {selectedGroup.members.length === 0 ? (
                  <div className="text-sm text-muted text-center py-4">No members</div>
                ) : (
                  <div className="space-y-2">
                    {selectedGroup.members.map(member => (
                      <div key={member.userId} className="flex items-center justify-between p-2 bg-[var(--bg-secondary)] rounded">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-[var(--bg-tertiary)] rounded-full flex items-center justify-center">
                            <User size={14} className="text-muted" />
                          </div>
                          <span className="text-sm">{member.username}</span>
                          {member.isSystemAdmin && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-600/30 dark:text-yellow-400 px-1.5 py-0.5 rounded">Admin</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={member.role}
                            onChange={(e) => handleUpdateMemberRole(member.userId, e.target.value as GroupRole)}
                            className="text-xs bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1"
                          >
                            <option value="admin">Admin</option>
                            <option value="operator">Operator</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            onClick={() => handleRemoveMember(member.userId, member.username)}
                            className="p-1 text-muted hover:text-red-500 transition-colors"
                            aria-label={`Remove ${member.username} from group`}
                          >
                            <UserMinus size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-muted">
              Select a group to view details and manage members
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
