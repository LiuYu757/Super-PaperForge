import { describe, it, expect } from 'vitest';

// Test the auto-close logic inline
function autoCloseEnv(lineText: string): string | null {
  const match = lineText.match(/^(\s*)\\begin\{([^}]+)\}\s*$/);
  if (!match) return null;
  return `\n${match[1]}  \n${match[1]}\\end{${match[2]}}`;
}

describe('environment auto-close', () => {
  it('closes \\begin{figure}', () => {
    const result = autoCloseEnv('\\begin{figure}');
    expect(result).toContain('\\end{figure}');
  });

  it('preserves indentation', () => {
    const result = autoCloseEnv('  \\begin{center}');
    expect(result).toContain('  \\end{center}');
    expect(result).toContain('    \n'); // extra indent for content
  });

  it('returns null for non-begin lines', () => {
    expect(autoCloseEnv('Hello world')).toBeNull();
    expect(autoCloseEnv('\\section{Intro}')).toBeNull();
    expect(autoCloseEnv('\\end{document}')).toBeNull();
  });

  it('handles starred environments', () => {
    const result = autoCloseEnv('\\begin{equation*}');
    expect(result).toContain('\\end{equation*}');
  });

  it('handles deeply indented code', () => {
    const result = autoCloseEnv('        \\begin{itemize}');
    expect(result).toContain('        \\end{itemize}');
  });
});
