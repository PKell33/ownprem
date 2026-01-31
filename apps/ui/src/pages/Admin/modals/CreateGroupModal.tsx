import { useState } from 'react';
import Modal from '../../../components/Modal';

interface CreateGroupModalProps {
  onSubmit: (name: string, description: string, totpRequired: boolean) => void;
  onClose: () => void;
}

/**
 * Modal for creating a new group.
 * IMPORTANT: Must be conditionally rendered with {showModal && <CreateGroupModal />}
 */
export default function CreateGroupModal({ onSubmit, onClose }: CreateGroupModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [totpRequired, setTotpRequired] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(name, description, totpRequired);
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Create New Group"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="create-group-name" className="block text-sm font-medium text-muted mb-1">Group Name</label>
          <input
            id="create-group-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg"
            placeholder="e.g., Operators"
            required
            aria-required="true"
            minLength={2}
          />
        </div>
        <div>
          <label htmlFor="create-group-description" className="block text-sm font-medium text-muted mb-1">Description</label>
          <input
            id="create-group-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg"
            placeholder="Optional description"
          />
        </div>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="totpRequired"
            checked={totpRequired}
            onChange={(e) => setTotpRequired(e.target.checked)}
            className="w-4 h-4 rounded border-[var(--border-color)] bg-[var(--bg-primary)]"
          />
          <label htmlFor="totpRequired" className="text-sm text-muted">
            Require 2FA for all members
          </label>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-color)]">
          <button type="button" onClick={onClose} className="px-4 py-2 text-muted hover:text-[var(--text-primary)]">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white rounded-lg font-medium"
          >
            Create Group
          </button>
        </div>
      </form>
    </Modal>
  );
}
