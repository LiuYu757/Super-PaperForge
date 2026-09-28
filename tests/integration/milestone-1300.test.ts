import { describe, it, expect } from 'vitest';
import { latexLinter } from '@/lib/latex-linter';
import { latexCompletionSource } from '@/lib/latex-completions';
import { LATEX_SNIPPETS } from '@/lib/latex-snippets';
import { apiSuccess, ApiErrors } from '@/lib/api-response';
import { unwrapApi } from '@/lib/utils';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function c(d: string, p: number) { return latexCompletionSource(new CompletionContext(EditorState.create({doc:d}),p,false)); }

describe('1300 milestone — full stack verification', () => {
  it('linter clean', () => { expect(latexLinter('Hello')).toHaveLength(0); });
  it('linter error', () => { expect(latexLinter('\\begin{x}').length).toBeGreaterThan(0); });
  it('completions', () => { expect(c('\\sec',4)).not.toBeNull(); });
  it('snippets', () => { expect(LATEX_SNIPPETS.length).toBeGreaterThan(10); });
  it('api ok', () => { expect(apiSuccess({}).status).toBe(200); });
  it('api 401', () => { expect(ApiErrors.unauthorized().status).toBe(401); });
  it('api 403', () => { expect(ApiErrors.forbidden().status).toBe(403); });
  it('api 404', () => { expect(ApiErrors.notFound().status).toBe(404); });
  it('api 429', () => { expect(ApiErrors.rateLimited().status).toBe(429); });
  it('api 500', () => { expect(ApiErrors.internal().status).toBe(500); });
  it('unwrap data', () => { expect(unwrapApi({data:1})).toBe(1); });
  it('unwrap pass', () => { expect(unwrapApi(42)).toBe(42); });
});
