'use client';

import { useState, memo } from 'react';
import { SparklesIcon, SendIcon, LoaderCircleIcon, CopyIcon, CheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorStore } from '@/store/editor-store';
import { toast } from 'sonner';
import { copyToClipboard } from '@/lib/clipboard';

type Mode = 'fix' | 'explain' | 'complete' | 'convert';

const MODES: { value: Mode; label: string; desc: string }[] = [
  { value: 'complete', label: 'Complete', desc: 'Extend or write LaTeX' },
  { value: 'fix', label: 'Fix', desc: 'Fix errors in selection' },
  { value: 'explain', label: 'Explain', desc: 'Explain code or error' },
  { value: 'convert', label: 'Convert', desc: 'Text → LaTeX' },
];

export const AiAssistant = memo(function AiAssistant() {
  const [prompt, setPrompt] = useState('');
  const [mode, setMode] = useState<Mode>('complete');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeTab = useEditorStore((s) => s.activeTab);
  const tabs = useEditorStore((s) => s.tabs);
  const tabData = tabs.find((t) => t.path === activeTab);

  async function handleSubmit() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setResult('');

    try {
      const res = await fetch('/api/v1/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          context: tabData?.content?.slice(0, 5000),
          mode,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: { message?: string } }).error?.message || 'AI request failed');
      }

      const data = await res.json();
      setResult(data.data?.result ?? data.result ?? '');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'AI request failed');
    } finally {
      setLoading(false);
    }
  }

  function handleInsert() {
    if (!result) return;
    window.dispatchEvent(new CustomEvent('latex-insert', { detail: { text: result } }));
    toast.success('Inserted into editor');
  }

  async function handleCopy() {
    const ok = await copyToClipboard(result);
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <SparklesIcon className="size-4 text-orange-500" />
        <span className="text-sm font-medium">AI Assistant</span>
      </div>

      {/* Mode selector */}
      <div className="flex gap-0.5 border-b p-1.5" role="tablist" aria-label="AI assistant mode">
        {MODES.map((m) => (
          <button
            key={m.value}
            role="tab"
            aria-selected={mode === m.value}
            aria-label={`${m.label}: ${m.desc}`}
            className={`flex-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
              mode === m.value
                ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            onClick={() => setMode(m.value)}
            title={m.desc}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="border-b p-2">
        <textarea
          placeholder={mode === 'fix' ? 'Describe the error or paste code...' : mode === 'convert' ? 'Describe what you want in LaTeX...' : 'Ask anything about LaTeX...'}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          className="w-full resize-none rounded-md border bg-muted/30 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-ring"
          rows={3}
        />
        <div className="mt-1.5 flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground">
            {tabData ? `Context: ${tabData.path}` : 'No file context'}
          </p>
          <Button size="sm" onClick={handleSubmit} disabled={loading || !prompt.trim()} className="h-7 gap-1 text-xs">
            {loading ? <LoaderCircleIcon className="size-3 animate-spin" /> : <SendIcon className="size-3" />}
            {loading ? 'Thinking...' : 'Ask AI'}
          </Button>
        </div>
      </div>

      {/* Result */}
      <ScrollArea className="flex-1">
        {result ? (
          <div className="p-3">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[10px] font-medium text-muted-foreground">Result</span>
              <div className="flex gap-1">
                <Button size="icon-xs" variant="ghost" onClick={handleCopy} title="Copy">
                  {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
                </Button>
                <Button size="xs" variant="outline" onClick={handleInsert} className="h-6 text-[10px]">
                  Insert
                </Button>
              </div>
            </div>
            <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed">
              {result}
            </pre>
          </div>
        ) : !loading ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <SparklesIcon className="size-8 opacity-20" />
            <p className="text-xs">Ask the AI to write, fix, or explain LaTeX</p>
            <p className="max-w-[200px] text-[10px] opacity-60">
              Uses your current file as context. Powered by Claude.
            </p>
          </div>
        ) : null}
      </ScrollArea>
    </div>
  );
});
