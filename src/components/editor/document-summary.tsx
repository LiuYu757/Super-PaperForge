'use client';

import { useState, memo } from 'react';
import { SparklesIcon, FileTextIcon, LoaderCircleIcon, CopyIcon, CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorStore } from '@/store/editor-store';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';

export const DocumentSummary = memo(function DocumentSummary() {
  const [summary, setSummary] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeTab = useEditorStore((s) => s.activeTab);
  const tabs = useEditorStore((s) => s.tabs);
  const tabData = tabs.find((t) => t.path === activeTab);

  async function generateSummary() {
    if (!tabData || loading) return;
    setLoading(true);
    setSummary('');

    try {
      const res = await fetch('/api/v1/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'Generate a concise abstract/summary of this LaTeX document in 3-5 sentences. Focus on the main contributions, methodology, and conclusions.',
          context: tabData.content.slice(0, 5000),
          mode: 'explain',
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: { message?: string } }).error?.message || 'Failed to generate summary');
      }

      const data = await res.json();
      setSummary(data.data?.result ?? data.result ?? '');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate summary');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    const ok = await copyToClipboard(summary);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  function handleInsert() {
    if (!summary) return;
    const abstractBlock = `\\begin{abstract}\n${summary}\n\\end{abstract}`;
    window.dispatchEvent(new CustomEvent('latex-insert', { detail: { text: abstractBlock } }));
    toast.success('Abstract inserted');
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <SparklesIcon className="size-4 text-orange-500" />
        <span className="text-sm font-medium">AI Summary</span>
      </div>

      <div className="border-b p-3">
        <Button
          onClick={generateSummary}
          disabled={loading || !tabData}
          className="w-full gap-1.5 text-xs"
        >
          {loading ? (
            <><LoaderCircleIcon className="size-3.5 animate-spin" /> Generating...</>
          ) : (
            <><SparklesIcon className="size-3.5" /> Generate Abstract</>
          )}
        </Button>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Uses AI to summarize your document into an abstract
        </p>
      </div>

      <ScrollArea className="flex-1">
        {summary ? (
          <div className="p-3">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[10px] font-medium text-muted-foreground">Generated Abstract</span>
              <div className="flex gap-1">
                <Button size="icon-xs" variant="ghost" onClick={handleCopy} title="Copy">
                  {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
                </Button>
                <Button size="xs" variant="outline" onClick={handleInsert} className="h-6 text-[10px]">
                  Insert
                </Button>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed">
              {summary}
            </div>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
            <LoaderCircleIcon className="size-8 animate-spin opacity-40" />
            <p className="text-xs font-medium">Analyzing your document...</p>
            <p className="max-w-[200px] text-[10px] opacity-60">
              The AI is reading your LaTeX source and generating a concise abstract. This may take a few seconds.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <FileTextIcon className="size-8 opacity-20" />
            <p className="text-xs">Generate an AI-powered abstract</p>
            <p className="max-w-[200px] text-[10px] opacity-60">
              Click the button above to create a summary of your document. Insert it as \begin{'{abstract}'}.
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
});
