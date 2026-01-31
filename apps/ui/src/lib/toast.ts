import { toast } from 'sonner';

export function showError(message: string, title?: string) {
  toast.error(title || 'Error', { description: message });
}

export function showSuccess(message: string, title?: string) {
  toast.success(title || 'Success', { description: message });
}

export function showCommandResult(status: 'success' | 'error', action: string, message?: string) {
  const actionName = action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  if (status === 'success') {
    toast.success(`${actionName} completed`);
  } else {
    toast.error(`${actionName} failed`, { description: message });
  }
}

export { toast };
