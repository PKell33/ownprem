import { useState, useEffect } from 'react';
import { Loader2, Save } from 'lucide-react';
import Modal from './Modal';
import { api } from '../api/client';
import type { ConfigField, Deployment, AppManifest } from '../api/client';

interface EditConfigModalProps {
  deployment: Deployment;
  app: AppManifest;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function EditConfigModal({
  deployment,
  app,
  isOpen,
  onClose,
  onSaved,
}: EditConfigModalProps) {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize config from deployment's current config
  useEffect(() => {
    if (deployment?.config) {
      setConfig({ ...deployment.config });
    }
  }, [deployment]);

  // Filter to only show editable fields (not generated, not inherited)
  const editableFields = app?.configSchema?.filter(
    (f) => !f.generated && !f.inheritFrom
  ) || [];

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateDeployment(deployment.id, config);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = () => {
    return JSON.stringify(config) !== JSON.stringify(deployment.config);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Configure ${app.displayName}`} size="md">
      <div className="space-y-6">
        {editableFields.length > 0 ? (
          <div className="space-y-4">
            {editableFields.map((field) => (
              <ConfigFieldInput
                key={field.name}
                field={field}
                value={config[field.name]}
                onChange={(value) => setConfig({ ...config, [field.name]: value })}
              />
            ))}
          </div>
        ) : (
          <div className="text-gray-500 dark:text-gray-400 text-center py-8">
            This app has no configurable options.
          </div>
        )}

        {error && (
          <div role="alert" aria-live="polite" className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="text-sm text-gray-500 dark:text-gray-400">
          Note: The app will be restarted to apply configuration changes.
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges() || editableFields.length === 0}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-accent hover:bg-accent/90 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-500 text-slate-900 font-medium rounded transition-colors"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save & Restart
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ConfigFieldInput({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `field-${field.name}`;
  const descriptionId = field.description ? `${id}-description` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium mb-2">
        {field.label}
        {field.required && <span className="text-red-400 ml-1" aria-hidden="true">*</span>}
      </label>

      {field.description && (
        <p id={descriptionId} className="text-sm text-gray-500 dark:text-gray-400 mb-2">{field.description}</p>
      )}

      {field.type === 'select' && field.options ? (
        <select
          id={id}
          value={String(value || '')}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded focus:outline-none focus:border-accent"
          aria-required={field.required}
          aria-describedby={descriptionId}
        >
          {field.options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === 'boolean' ? (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-accent focus:ring-accent"
            aria-describedby={descriptionId}
          />
          <span className="text-gray-600 dark:text-gray-300">Enabled</span>
        </label>
      ) : field.type === 'number' ? (
        <input
          id={id}
          type="number"
          value={String(value || '')}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded focus:outline-none focus:border-accent"
          aria-required={field.required}
          aria-describedby={descriptionId}
        />
      ) : field.secret ? (
        <input
          id={id}
          type="password"
          value={String(value || '')}
          placeholder="********"
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded focus:outline-none focus:border-accent"
          aria-required={field.required}
          aria-describedby={descriptionId}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={String(value || '')}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded focus:outline-none focus:border-accent"
          aria-required={field.required}
          aria-describedby={descriptionId}
        />
      )}
    </div>
  );
}
