import { describe, it, expect } from 'vitest';
import { latexLinter } from '@/lib/latex-linter';
import { latexCompletionSource } from '@/lib/latex-completions';
import { parseLatexLog, diagnosticSummary } from '@/lib/latex-error-parser';
import { LATEX_SNIPPETS } from '@/lib/latex-snippets';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

/**
 * Smoke tests — verify all major subsystems initialize without error.
 * These would catch build/import issues that cause 500 on deploy.
 */
describe('deployment smoke tests', () => {
  it('linter initializes', () => {
    expect(latexLinter('')).toEqual([]);
  });

  it('completions initialize', () => {
    const state = EditorState.create({ doc: '\\' });
    const ctx = new CompletionContext(state, 1, false);
    expect(latexCompletionSource(ctx)).not.toBeNull();
  });

  it('error parser initializes', () => {
    expect(diagnosticSummary(parseLatexLog(''))).toEqual({ errors: 0, warnings: 0 });
  });

  it('snippets loaded', () => {
    expect(LATEX_SNIPPETS.length).toBeGreaterThan(10);
  });

  it('API helpers initialize', async () => {
    const ok = apiSuccess({ test: true });
    expect(ok.status).toBe(200);
    const err = ApiErrors.unauthorized();
    expect(err.status).toBe(401);
  });
});
