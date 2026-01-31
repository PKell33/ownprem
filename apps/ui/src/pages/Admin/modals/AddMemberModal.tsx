import { useState } from 'react';
import Modal from '../../../components/Modal';
import type { UserInfo } from '../../../api/client';
import type { GroupRole } from '../types';

interface AddMemberModalProps {
  users: UserInfo[];
  onAdd: (userId: string, role: GroupRole) => void;
  onClose: () => void;
}

/**
 * Modal for adding a member to a group.
 * IMPORTANT: Must be conditionally rendered with {showModal && <AddMemberModal />}
 */
export default function AddMemberModal({ users, onAdd, onClose }: AddMemberModalProps) {
  const [selectedUser, setSelectedUser] = useState('');
  const [role, setRole] = useState<GroupRole>('viewer');

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Add Member"
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="add-member-user" className="block text-sm font-medium text-muted mb-1">User</label>
          <select
            id="add-member-user"
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg"
            aria-required="true"
          >
            <option value="">Select user...</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.username}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="add-member-role" className="block text-sm font-medium text-muted mb-1">Role</label>
          <select
            id="add-member-role"
            value={role}
            onChange={(e) => setRole(e.target.value as GroupRole)}
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg"
          >
            <option value="viewer">Viewer</option>
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
          <button onClick={onClose} className="px-4 py-2 text-muted hover:text-[var(--text-primary)]">
            Cancel
          </button>
          <button
            onClick={() => selectedUser && onAdd(selectedUser, role)}
            disabled={!selectedUser}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-medium"
          >
            Add Member
          </button>
        </div>
      </div>
    </Modal>
  );
}
