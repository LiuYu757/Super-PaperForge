'use client';

import Link from 'next/link';
import { useState } from 'react';
import { FlameIcon, SearchIcon, CopyIcon, CheckIcon } from 'lucide-react';
import { copyToClipboard } from '@/lib/clipboard';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const SYMBOLS: { cat: string; items: { cmd: string; desc: string }[] }[] = [
  { cat: 'Greek Letters', items: [
    { cmd: '\\alpha', desc: 'α' }, { cmd: '\\beta', desc: 'β' }, { cmd: '\\gamma', desc: 'γ' },
    { cmd: '\\delta', desc: 'δ' }, { cmd: '\\epsilon', desc: 'ε' }, { cmd: '\\zeta', desc: 'ζ' },
    { cmd: '\\eta', desc: 'η' }, { cmd: '\\theta', desc: 'θ' }, { cmd: '\\lambda', desc: 'λ' },
    { cmd: '\\mu', desc: 'μ' }, { cmd: '\\pi', desc: 'π' }, { cmd: '\\sigma', desc: 'σ' },
    { cmd: '\\omega', desc: 'ω' }, { cmd: '\\Gamma', desc: 'Γ' }, { cmd: '\\Delta', desc: 'Δ' },
    { cmd: '\\Omega', desc: 'Ω' },
  ]},
  { cat: 'Math Operators', items: [
    { cmd: '\\frac{a}{b}', desc: 'a/b fraction' }, { cmd: '\\sqrt{x}', desc: '√x' },
    { cmd: '\\sum', desc: '∑' }, { cmd: '\\prod', desc: '∏' }, { cmd: '\\int', desc: '∫' },
    { cmd: '\\lim', desc: 'lim' }, { cmd: '\\infty', desc: '∞' }, { cmd: '\\partial', desc: '∂' },
    { cmd: '\\nabla', desc: '∇' }, { cmd: '\\pm', desc: '±' }, { cmd: '\\times', desc: '×' },
    { cmd: '\\div', desc: '÷' }, { cmd: '\\leq', desc: '≤' }, { cmd: '\\geq', desc: '≥' },
    { cmd: '\\neq', desc: '≠' }, { cmd: '\\approx', desc: '≈' },
  ]},
  { cat: 'Arrows', items: [
    { cmd: '\\rightarrow', desc: '→' }, { cmd: '\\leftarrow', desc: '←' },
    { cmd: '\\Rightarrow', desc: '⇒' }, { cmd: '\\Leftarrow', desc: '⇐' },
    { cmd: '\\leftrightarrow', desc: '↔' }, { cmd: '\\uparrow', desc: '↑' },
    { cmd: '\\downarrow', desc: '↓' }, { cmd: '\\mapsto', desc: '↦' },
  ]},
  { cat: 'Sets & Logic', items: [
    { cmd: '\\in', desc: '∈' }, { cmd: '\\notin', desc: '∉' }, { cmd: '\\subset', desc: '⊂' },
    { cmd: '\\cup', desc: '∪' }, { cmd: '\\cap', desc: '∩' }, { cmd: '\\emptyset', desc: '∅' },
    { cmd: '\\forall', desc: '∀' }, { cmd: '\\exists', desc: '∃' },
    { cmd: '\\neg', desc: '¬' }, { cmd: '\\land', desc: '∧' }, { cmd: '\\lor', desc: '∨' },
  ]},
  { cat: 'Formatting', items: [
    { cmd: '\\textbf{text}', desc: 'Bold' }, { cmd: '\\textit{text}', desc: 'Italic' },
    { cmd: '\\underline{text}', desc: 'Underline' }, { cmd: '\\texttt{text}', desc: 'Monospace' },
    { cmd: '\\mathbb{R}', desc: 'ℝ' }, { cmd: '\\mathcal{L}', desc: 'ℒ' },
  ]},
];

export default function SymbolsPage() {
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = SYMBOLS.map(g => ({
    ...g,
    items: g.items.filter(i => i.cmd.toLowerCase().includes(search.toLowerCase()) || i.desc.includes(search)),
  })).filter(g => g.items.length > 0);

  async function copy(cmd: string) {
    const ok = await copyToClipboard(cmd);
    if (ok) { setCopied(cmd); setTimeout(() => setCopied(null), 1500); }
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center gap-2 border-b px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <FlameIcon className="size-6 text-orange-500" />
          <span className="text-lg font-bold">PaperForge</span>
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground">Docs</Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">Symbol Reference</span>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-4xl font-extrabold tracking-tight">LaTeX Symbol Reference</h1>
        <p className="mt-2 text-muted-foreground">Click any symbol to copy the LaTeX command.</p>

        <div className="relative mt-6 max-w-md">
          <SearchIcon className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search symbols..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="mt-8 space-y-8">
          {filtered.map(g => (
            <div key={g.cat}>
              <h2 className="mb-3 text-lg font-bold">{g.cat} <Badge variant="secondary" className="ml-1 text-[10px]">{g.items.length}</Badge></h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {g.items.map(i => (
                  <button key={i.cmd} onClick={() => copy(i.cmd)}
                    aria-label={`Copy ${i.cmd}`}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all hover:bg-muted hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <span className="text-xl" aria-hidden="true">{i.desc}</span>
                    <code className="flex-1 truncate font-mono text-xs text-muted-foreground">{i.cmd}</code>
                    {copied === i.cmd ? <CheckIcon className="size-3.5 text-green-500" aria-hidden="true" /> : <CopyIcon className="size-3 text-muted-foreground/50" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
