'use client';

import { useState, memo } from 'react';
import { SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';

interface Symbol {
  cmd: string;
  char: string;
  name: string;
}

const SYMBOLS: Symbol[] = [
  // Greek lowercase
  { cmd: '\\alpha', char: 'α', name: 'alpha' },
  { cmd: '\\beta', char: 'β', name: 'beta' },
  { cmd: '\\gamma', char: 'γ', name: 'gamma' },
  { cmd: '\\delta', char: 'δ', name: 'delta' },
  { cmd: '\\epsilon', char: 'ε', name: 'epsilon' },
  { cmd: '\\zeta', char: 'ζ', name: 'zeta' },
  { cmd: '\\eta', char: 'η', name: 'eta' },
  { cmd: '\\theta', char: 'θ', name: 'theta' },
  { cmd: '\\iota', char: 'ι', name: 'iota' },
  { cmd: '\\kappa', char: 'κ', name: 'kappa' },
  { cmd: '\\lambda', char: 'λ', name: 'lambda' },
  { cmd: '\\mu', char: 'μ', name: 'mu' },
  { cmd: '\\nu', char: 'ν', name: 'nu' },
  { cmd: '\\xi', char: 'ξ', name: 'xi' },
  { cmd: '\\pi', char: 'π', name: 'pi' },
  { cmd: '\\rho', char: 'ρ', name: 'rho' },
  { cmd: '\\sigma', char: 'σ', name: 'sigma' },
  { cmd: '\\tau', char: 'τ', name: 'tau' },
  { cmd: '\\phi', char: 'φ', name: 'phi' },
  { cmd: '\\chi', char: 'χ', name: 'chi' },
  { cmd: '\\psi', char: 'ψ', name: 'psi' },
  { cmd: '\\omega', char: 'ω', name: 'omega' },
  // Greek uppercase
  { cmd: '\\Gamma', char: 'Γ', name: 'Gamma' },
  { cmd: '\\Delta', char: 'Δ', name: 'Delta' },
  { cmd: '\\Theta', char: 'Θ', name: 'Theta' },
  { cmd: '\\Lambda', char: 'Λ', name: 'Lambda' },
  { cmd: '\\Sigma', char: 'Σ', name: 'Sigma' },
  { cmd: '\\Phi', char: 'Φ', name: 'Phi' },
  { cmd: '\\Psi', char: 'Ψ', name: 'Psi' },
  { cmd: '\\Omega', char: 'Ω', name: 'Omega' },
  // Operators
  { cmd: '\\pm', char: '±', name: 'plus-minus' },
  { cmd: '\\times', char: '×', name: 'times' },
  { cmd: '\\div', char: '÷', name: 'divide' },
  { cmd: '\\cdot', char: '·', name: 'dot' },
  { cmd: '\\leq', char: '≤', name: 'less-equal' },
  { cmd: '\\geq', char: '≥', name: 'greater-equal' },
  { cmd: '\\neq', char: '≠', name: 'not-equal' },
  { cmd: '\\approx', char: '≈', name: 'approximately' },
  { cmd: '\\equiv', char: '≡', name: 'equivalent' },
  { cmd: '\\sim', char: '∼', name: 'similar' },
  // Set theory
  { cmd: '\\in', char: '∈', name: 'element-of' },
  { cmd: '\\notin', char: '∉', name: 'not-element' },
  { cmd: '\\subset', char: '⊂', name: 'subset' },
  { cmd: '\\supset', char: '⊃', name: 'superset' },
  { cmd: '\\cup', char: '∪', name: 'union' },
  { cmd: '\\cap', char: '∩', name: 'intersection' },
  { cmd: '\\emptyset', char: '∅', name: 'empty-set' },
  // Logic
  { cmd: '\\forall', char: '∀', name: 'for-all' },
  { cmd: '\\exists', char: '∃', name: 'exists' },
  { cmd: '\\neg', char: '¬', name: 'negation' },
  { cmd: '\\wedge', char: '∧', name: 'and' },
  { cmd: '\\vee', char: '∨', name: 'or' },
  // Arrows
  { cmd: '\\rightarrow', char: '→', name: 'right-arrow' },
  { cmd: '\\leftarrow', char: '←', name: 'left-arrow' },
  { cmd: '\\Rightarrow', char: '⇒', name: 'implies' },
  { cmd: '\\Leftrightarrow', char: '⇔', name: 'iff' },
  { cmd: '\\uparrow', char: '↑', name: 'up-arrow' },
  { cmd: '\\downarrow', char: '↓', name: 'down-arrow' },
  // Calculus
  { cmd: '\\partial', char: '∂', name: 'partial' },
  { cmd: '\\nabla', char: '∇', name: 'nabla' },
  { cmd: '\\infty', char: '∞', name: 'infinity' },
  { cmd: '\\int', char: '∫', name: 'integral' },
  { cmd: '\\sum', char: '∑', name: 'summation' },
  { cmd: '\\prod', char: '∏', name: 'product' },
  { cmd: '\\sqrt{}', char: '√', name: 'square-root' },
  // Misc
  { cmd: '\\circ', char: '∘', name: 'compose' },
  { cmd: '\\bullet', char: '•', name: 'bullet' },
  { cmd: '\\star', char: '⋆', name: 'star' },
  { cmd: '\\dagger', char: '†', name: 'dagger' },
  { cmd: '\\ldots', char: '…', name: 'ellipsis' },
];

export const SymbolPicker = memo(function SymbolPicker() {
  const [filter, setFilter] = useState('');

  const filtered = filter.trim()
    ? SYMBOLS.filter((s) =>
        s.name.includes(filter.toLowerCase()) ||
        s.cmd.toLowerCase().includes(filter.toLowerCase()) ||
        s.char.includes(filter))
    : SYMBOLS;

  function handleClick(sym: Symbol) {
    window.dispatchEvent(new CustomEvent('latex-insert', { detail: { text: sym.cmd } }));
    toast.success(`Inserted ${sym.cmd}`, { duration: 1500 });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        <SearchIcon className="size-3.5 text-muted-foreground" />
        <Input
          placeholder="Search symbols..."
          aria-label="Filter symbols"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-6 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
        />
        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {filtered.length}
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-6 gap-0.5 p-2">
          {filtered.map((sym) => (
            <button
              key={sym.cmd}
              onClick={() => handleClick(sym)}
              title={`${sym.cmd} — ${sym.name}`}
              className="flex h-9 w-full items-center justify-center rounded-md text-lg transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {sym.char}
            </button>
          ))}
        </div>
        {filtered.length === 0 && (
          <p className="py-8 text-center text-xs text-muted-foreground">No symbols match &ldquo;{filter}&rdquo;</p>
        )}
      </ScrollArea>
    </div>
  );
});
