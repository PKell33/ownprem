import { memo, useCallback, useMemo } from 'react';
import Modal from '../../Modal';
import type { ConfirmAction } from '../types';

interface ConfirmActionModalProps {
  action: ConfirmAction | null;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Modal for confirming stop/restart/uninstall actions.
 * IMPORTANT: Must be conditionally rendered with {action && <ConfirmActionModal />}
 */
const ConfirmActionModal = memo(function ConfirmActionModal({
  action,
  onConfirm,
  onClose,
}: ConfirmActionModalProps) {
  const content = useMemo(() => {
    if (!action) return { title: '', message: '', buttonText: '', buttonClass: '' };

    switch (action.type) {
      case 'stop':
        return {
          title: `Stop ${action.appName}?`,
          message: 'The app will be stopped and any active connections will be terminated.',
          buttonText: 'Stop',
          buttonClass: 'bg-yellow-600 hover:bg-yellow-700',
        };
      case 'restart':
        return {
          title: `Restart ${action.appName}?`,
          message: 'The app will be restarted. This may briefly interrupt service.',
          buttonText: 'Restart',
          buttonClass: 'bg-blue-600 hover:bg-blue-700',
        };
      case 'uninstall':
        return {
          title: `Uninstall ${action.appName}?`,
          message: 'This will remove the app and all its data. This action cannot be undone.',
          buttonText: 'Uninstall',
          buttonClass: 'bg-red-600 hover:bg-red-700',
        };
    }
  }, [action]);

  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  if (!action) return null;

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={content.title}
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-[var(--text-secondary)]">
          {content.message}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 px-4 py-2 text-white rounded transition-colors ${content.buttonClass}`}
          >
            {content.buttonText}
          </button>
        </div>
      </div>
    </Modal>
  );
});

export default ConfirmActionModal;
