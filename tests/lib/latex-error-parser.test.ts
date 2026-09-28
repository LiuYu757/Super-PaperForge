import { describe, it, expect } from 'vitest';
import { parseLatexLog, diagnosticSummary } from '@/lib/latex-error-parser';

describe('parseLatexLog', () => {
  it('parses LaTeX errors with line numbers', () => {
    const log = `(./main.tex
! Undefined control sequence.
l.42 \\foo
     {bar}`;

    const diagnostics = parseLatexLog(log);
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);

    const error = diagnostics.find(d => d.type === 'error');
    expect(error).toBeDefined();
    expect(error!.message).toBe('Undefined control sequence.');
    expect(error!.line).toBe(42);
  });

  it('keeps file context from unclosed LaTeX file markers', () => {
    const log = `(./chapters/intro.tex
! Missing $ inserted.
l.17 Price is $5`;

    const diagnostics = parseLatexLog(log);
    const error = diagnostics.find(d => d.type === 'error');
    expect(error?.file).toBe('chapters/intro.tex');
    expect(error?.line).toBe(17);
  });

  it('parses warnings', () => {
    const log = `LaTeX Warning: Reference 'fig:test' on page 1 undefined on line 15.
Overfull \\hbox (4.2pt too wide) in paragraph at line 23`;

    const diagnostics = parseLatexLog(log);
    const warnings = diagnostics.filter(d => d.type === 'warning');
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('does not duplicate structured reference and badbox warnings', () => {
    const log = `LaTeX Warning: Reference 'fig:test' on page 1 undefined on input line 15.
Overfull \\hbox (4.2pt too wide) in paragraph at lines 23--24`;

    const diagnostics = parseLatexLog(log);
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0]).toMatchObject({
      type: 'warning',
      message: 'Undefined reference: fig:test',
      line: 15,
    });
    expect(diagnostics[1]).toMatchObject({
      type: 'warning',
      message: 'Overfull box (4.2pt)',
      line: 23,
    });
  });

  it('handles Overfull/Underfull warnings', () => {
    const log = `Overfull \\hbox (10pt too wide) at line 50
Underfull \\vbox detected at line 75`;

    const diagnostics = parseLatexLog(log);
    expect(diagnostics.length).toBeGreaterThanOrEqual(2);
    expect(diagnostics[0].type).toBe('warning');
    expect(diagnostics[1].type).toBe('warning');
  });

  it('parses package errors', () => {
    const log = `Package hyperref Error: Wrong DVI mode driver option 'dvips'`;

    const diagnostics = parseLatexLog(log);
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].type).toBe('error');
    expect(diagnostics[0].message).toContain('hyperref');
  });

  it('returns empty for clean log', () => {
    const log = `This is pdfTeX
Output written on main.pdf (1 page, 12345 bytes).
Transcript written on main.log.`;

    const diagnostics = parseLatexLog(log);
    expect(diagnostics.length).toBe(0);
  });
});

describe('diagnosticSummary', () => {
  it('counts errors and warnings', () => {
    const diagnostics = [
      { type: 'error' as const, message: 'err', raw: '' },
      { type: 'warning' as const, message: 'warn1', raw: '' },
      { type: 'warning' as const, message: 'warn2', raw: '' },
      { type: 'error' as const, message: 'err2', raw: '' },
    ];

    const summary = diagnosticSummary(diagnostics);
    expect(summary.errors).toBe(2);
    expect(summary.warnings).toBe(2);
  });

  it('handles empty diagnostics', () => {
    const summary = diagnosticSummary([]);
    expect(summary.errors).toBe(0);
    expect(summary.warnings).toBe(0);
  });
});
