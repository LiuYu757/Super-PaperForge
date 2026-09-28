'use client';

import { useState, useEffect, memo } from 'react';
import { Share2Icon, CopyIcon, CheckIcon, CodeIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useEditorStore } from '@/store/editor-store';
import { copyToClipboard } from '@/lib/clipboard';

export const ShareSnippet = memo(function ShareSnippet() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeTab = useEditorStore((s) => s.activeTab);
  const tabs = useEditorStore((s) => s.tabs);
  const tabData = tabs.find((t) => t.path === activeTab);

  function getSnippetUrl(): string {
    if (!tabData) return '';
    // Encode content as base64 for URL sharing
    const content = tabData.content.slice(0, 2000); // Limit to 2KB
    const encoded = btoa(Array.from(new TextEncoder().encode(content), b => String.fromCharCode(b)).join(''));
    const fileName = tabData.path.split('/').pop() || 'snippet.tex';
    return `${window.location.origin}/share?code=${encodeURIComponent(encoded)}&name=${encodeURIComponent(fileName)}`;
  }

  async function handleCopy() {
    const url = getSnippetUrl();
    const ok = await copyToClipboard(url, 'Share link copied!');
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  async function handleCopyCode() {
    if (!tabData) return;
    await copyToClipboard(tabData.content, 'Code copied to clipboard');
  }

  // Listen for share-snippet event from command palette
  useEffect(() => {
    function handleEvent() { setOpen(true); }
    window.addEventListener('share-snippet', handleEvent);
    return () => window.removeEventListener('share-snippet', handleEvent);
  }, []);

  if (!tabData) return null;

  const lines = tabData.content.split('\n').length;
  const words = tabData.content.replace(/\\[a-zA-Z]+/g, '').replace(/[{}$%]/g, '').trim().split(/\s+/).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2Icon className="size-5" />
            Share Snippet
          </DialogTitle>
          <DialogDescription>
            Share the current file as a code snippet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Preview */}
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CodeIcon className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">{tabData.path}</span>
              </div>
              <span className="text-xs text-muted-foreground" aria-label={`${lines} lines, ${words} words`}>{lines} lines · {words} words</span>
            </div>
            <pre className="max-h-32 overflow-auto font-mono text-xs leading-relaxed text-muted-foreground">{tabData.content.slice(0, 500)}{tabData.content.length > 500 ? '\n...' : ''}</pre>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={handleCopy} className="flex-1 gap-1.5 text-xs">
              {copied ? <CheckIcon className="size-3.5" /> : <Share2Icon className="size-3.5" />}
              {copied ? 'Copied!' : 'Copy Share Link'}
            </Button>
            <Button variant="outline" onClick={handleCopyCode} className="gap-1.5 text-xs">
              <CopyIcon className="size-3.5" />
              Copy Code
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Share link includes the first 2KB of the file encoded in the URL.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
});
