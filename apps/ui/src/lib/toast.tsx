import { toast } from 'sonner';
import { Copy, Check } from 'lucide-react';
import { useState } from 'react';

/**
 * Copy button component for toast notifications
 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    // Use execCommand as fallback for clipboard API
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }).catch(() => {
          // Fallback to execCommand
          fallbackCopy(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      } else {
        // Fallback for older browsers
        fallbackCopy(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      fallbackCopy(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded hover:bg-white/10 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? (
        <Check size={14} className="text-green-400" />
      ) : (
        <Copy size={14} className="text-slate-400 hover:text-slate-200" />
      )}
    </button>
  );
}

/**
 * Fallback copy method using execCommand
 */
function fallbackCopy(text: string): boolean {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-9999px';
  textArea.style.top = '-9999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
    return true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}

export function showError(message: string, title?: string) {
  const fullText = `${title || 'Error'}: ${message}`;
  toast.error(title || 'Error', {
    description: message,
    action: <CopyButton text={fullText} />,
  });
}

export function showSuccess(message: string, title?: string) {
  const fullText = title ? `${title}: ${message}` : message;
  toast.success(title || 'Success', {
    description: message,
    action: <CopyButton text={fullText} />,
  });
}

export function showCommandResult(status: 'success' | 'error', action: string, message?: string) {
  const actionName = action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  if (status === 'success') {
    const text = `${actionName} completed`;
    toast.success(text, { action: <CopyButton text={text} /> });
  } else {
    const text = message ? `${actionName} failed: ${message}` : `${actionName} failed`;
    toast.error(`${actionName} failed`, {
      description: message,
      action: <CopyButton text={text} />,
    });
  }
}

export { toast };
