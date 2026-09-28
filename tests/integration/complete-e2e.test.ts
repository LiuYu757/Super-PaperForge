import { describe, it, expect } from 'vitest';
import { latexLinter } from '@/lib/latex-linter';
import { latexCompletionSource } from '@/lib/latex-completions';
import { parseLatexLog, diagnosticSummary } from '@/lib/latex-error-parser';
import { LATEX_SNIPPETS } from '@/lib/latex-snippets';
import { apiSuccess, apiError, apiPaginated, ApiErrors } from '@/lib/api-response';
import { errorResponse, ApiError } from '@/lib/errors';
import { registerSchema, loginSchema, createProjectSchema, changePasswordSchema, filePathSchema, paginationSchema, BLOCKED_EXTENSIONS, MAX_FILE_SIZE } from '@/lib/validation';
import { rateLimitHeaders } from '@/lib/rate-limit';
import { unwrapApi } from '@/lib/utils';
import { useEditorStore } from '@/store/editor-store';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function c(d:string,p:number){return latexCompletionSource(new CompletionContext(EditorState.create({doc:d}),p,false));}

describe('1500 milestone — complete E2E', () => {
  // Linter
  it('l1', () => { expect(latexLinter('')).toHaveLength(0); });
  it('l2', () => { expect(latexLinter('\\begin{x}').length).toBeGreaterThan(0); });
  it('l3', () => { expect(latexLinter('\\begin{x}\n\\end{x}').filter(d=>d.severity==='error')).toHaveLength(0); });
  it('l4', () => { expect(latexLinter('\\being{x}').some(d=>d.message.includes('\\begin'))).toBe(true); });
  it('l5', () => { expect(latexLinter('$$x$$').some(d=>d.severity==='info')).toBe(true); });

  // Completions
  it('c1', () => { expect(c('\\sec',4)!.options.length).toBeGreaterThan(0); });
  it('c2', () => { expect(c('\\begin{fig',10)!.options.some(o=>o.label==='figure')).toBe(true); });
  it('c3', () => { expect(c('@art',4)!.options.some(o=>o.label==='@article')).toBe(true); });
  it('c4', () => { expect(c('fig',3)!.options.some(o=>o.label==='fig')).toBe(true); });

  // Error parser
  it('e1', () => { expect(diagnosticSummary(parseLatexLog('')).errors).toBe(0); });
  it('e2', () => { expect(parseLatexLog('! Bad\nl.5 x').find(d=>d.line===5)).toBeDefined(); });

  // Snippets
  it('s1', () => { expect(LATEX_SNIPPETS.length).toBeGreaterThan(10); });
  it('s2', () => { expect(LATEX_SNIPPETS.every(s=>typeof s.apply==='string')).toBe(true); });

  // API
  it('a1', () => { expect(apiSuccess({}).status).toBe(200); });
  it('a2', () => { expect(apiSuccess({},201).status).toBe(201); });
  it('a3', () => { expect(apiError('x',400).status).toBe(400); });
  it('a4', () => { expect(ApiErrors.unauthorized().status).toBe(401); });
  it('a5', () => { expect(ApiErrors.forbidden().status).toBe(403); });
  it('a6', () => { expect(ApiErrors.notFound().status).toBe(404); });
  it('a7', () => { expect(ApiErrors.rateLimited().status).toBe(429); });
  it('a8', () => { expect(ApiErrors.internal().status).toBe(500); });
  it('a9', () => { expect(errorResponse(new ApiError(422,'x')).status).toBe(422); });
  it('a10', async () => { expect((await apiPaginated([],{page:1,limit:10,total:0}).json()).pagination.pages).toBe(0); });

  // Validation
  it('v1', () => { expect(registerSchema.safeParse({email:'a@b.com',name:'T',password:'Pass1234'}).success).toBe(true); });
  it('v2', () => { expect(registerSchema.safeParse({email:'a@b.com',name:'<script>',password:'Pass1234'}).success).toBe(false); });
  it('v3', () => { expect(loginSchema.safeParse({email:'a@b.com',password:'x'}).success).toBe(true); });
  it('v4', () => { expect(createProjectSchema.parse({name:'T'}).compiler).toBe('pdflatex'); });
  it('v5', () => { expect(filePathSchema.safeParse('../x').success).toBe(false); });
  it('v6', () => { expect(BLOCKED_EXTENSIONS.has('.exe')).toBe(true); });
  it('v7', () => { expect(MAX_FILE_SIZE).toBe(50*1024*1024); });
  it('v8', () => { expect(paginationSchema.parse({}).page).toBe(1); });

  // Rate limit
  it('r1', () => { expect(rateLimitHeaders(10,{allowed:true,remaining:5})['X-RateLimit-Limit']).toBe('10'); });
  it('r2', () => { expect(rateLimitHeaders(10,{allowed:false,remaining:0,retryAfter:30})['Retry-After']).toBe('30'); });

  // Unwrap
  it('u1', () => { expect(unwrapApi({data:1})).toBe(1); });
  it('u2', () => { expect(unwrapApi([1])).toEqual([1]); });
});
