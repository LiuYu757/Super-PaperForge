import { describe, it, expect } from 'vitest';

function parseOutline(content: string) {
  const items: Array<{ level: number; title: string; line: number }> = [];
  const lines = content.split('\n');
  const re = /\\(part|chapter|section|subsection|subsubsection|paragraph)\*?\{([^}]+)\}/;
  const map: Record<string, number> = { part:0, chapter:1, section:2, subsection:3, subsubsection:4, paragraph:5 };
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) items.push({ level: map[m[1]] ?? 2, title: m[2].trim(), line: i + 1 });
  }
  return items;
}

describe('outline advanced', () => {
  it('handles full thesis structure', () => {
    const doc = `\\chapter{Introduction}
\\section{Background}
\\subsection{Prior Work}
\\chapter{Methods}
\\section{Data}
\\section{Analysis}
\\chapter{Results}
\\chapter{Conclusion}`;
    const o = parseOutline(doc);
    expect(o).toHaveLength(8);
    expect(o.filter(x => x.level === 1)).toHaveLength(4);
    expect(o.filter(x => x.level === 2)).toHaveLength(3);
  });

  it('preserves correct line numbers', () => {
    const doc = `Line 1
Line 2
\\section{Third}
Line 4
\\section{Fifth}`;
    const o = parseOutline(doc);
    expect(o[0].line).toBe(3);
    expect(o[1].line).toBe(5);
  });

  it('handles mixed starred and unstarred', () => {
    const doc = `\\section{Numbered}
\\section*{Unnumbered}
\\subsection{Sub}`;
    expect(parseOutline(doc)).toHaveLength(3);
  });
});
