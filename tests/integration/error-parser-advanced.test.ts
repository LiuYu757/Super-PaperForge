import { describe, it, expect } from 'vitest';
import { parseLatexLog, diagnosticSummary } from '@/lib/latex-error-parser';

describe('error parser advanced', () => {
  it('handles multiline error messages', () => {
    const log = `! LaTeX Error: Something went wrong.

See the LaTeX manual for explanation.
l.25 \\badcommand`;
    const d = parseLatexLog(log);
    expect(d.some(x => x.type === 'error' && x.line === 25)).toBe(true);
  });

  it('counts mixed errors and warnings', () => {
    const log = `! Undefined control sequence.
l.10 \\foo
LaTeX Warning: Reference 'x' undefined.
Overfull \\hbox (5pt too wide)
! Missing $ inserted.
l.20 bad math`;
    const s = diagnosticSummary(parseLatexLog(log));
    expect(s.errors).toBeGreaterThanOrEqual(2);
    expect(s.warnings).toBeGreaterThanOrEqual(2);
  });

  it('handles empty log', () => {
    expect(diagnosticSummary(parseLatexLog(''))).toEqual({ errors: 0, warnings: 0 });
  });

  it('detects Class errors', () => {
    const log = `Class IEEEtran Error: Missing \\author.`;
    expect(parseLatexLog(log).some(d => d.type === 'error')).toBe(true);
  });
});
