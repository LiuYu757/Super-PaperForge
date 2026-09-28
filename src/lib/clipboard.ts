import { toast } from 'sonner';

/**
 * Copy text to clipboard with graceful fallback for older browsers.
 * Shows a success/error toast automatically.
 */
export async function copyToClipboard(
  text: string,
  successMessage = 'Copied to clipboard',
): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      // Fallback for older browsers or insecure contexts
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      try {
        textarea.select();
        const ok = document.execCommand('copy');
        if (!ok) {
          toast.error('Failed to copy to clipboard');
          return false;
        }
      } finally {
        document.body.removeChild(textarea);
      }
    }
    toast.success(successMessage);
    return true;
  } catch {
    toast.error('Failed to copy to clipboard');
    return false;
  }
}
