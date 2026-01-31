import { memo, useMemo } from 'react';
import Modal from '../../Modal';
import AppSelectButton from '../AppSelectButton';
import type { AppManifest } from '../../../api/client';

interface AddAppModalProps {
  serverName: string;
  availableApps: AppManifest[];
  onSelectApp: (appName: string) => void;
  onClose: () => void;
}

// Category display order
const CATEGORY_ORDER = ['system', 'database', 'web', 'networking', 'monitoring', 'utility', 'other'];

/**
 * Modal for selecting an app to install on a server.
 * IMPORTANT: Must be conditionally rendered with {showModal && <AddAppModal />}
 */
const AddAppModal = memo(function AddAppModal({
  serverName,
  availableApps,
  onSelectApp,
  onClose,
}: AddAppModalProps) {
  // Group apps by category
  const appsByCategory = useMemo(() =>
    availableApps.reduce((acc, app) => {
      const category = app.category || 'other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(app);
      return acc;
    }, {} as Record<string, AppManifest[]>),
    [availableApps]
  );

  // Get categories that have apps
  const categoriesWithApps = useMemo(() =>
    CATEGORY_ORDER.filter(cat => appsByCategory[cat]?.length > 0),
    [appsByCategory]
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Add App"
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-[var(--text-secondary)] text-sm">
          Select an app to install on <span className="font-medium text-[var(--text-primary)]">{serverName}</span>
        </p>

        {categoriesWithApps.length === 0 ? (
          <div className="text-center py-8 text-muted">
            All available apps are already installed on this server.
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {categoriesWithApps.map((category) => (
              <div key={category}>
                <h3 className="text-sm font-medium text-muted mb-2 capitalize">{category}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {appsByCategory[category].map((app) => (
                    <AppSelectButton
                      key={app.name}
                      app={app}
                      onSelect={() => onSelectApp(app.name)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-4 border-t border-[var(--border-color)]">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-secondary)] rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
});

export default AddAppModal;
