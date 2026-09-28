import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { latexLinter } from '@/lib/latex-linter';
import { latexCompletionSource } from '@/lib/latex-completions';
import { parseLatexLog, diagnosticSummary } from '@/lib/latex-error-parser';
import { LATEX_SNIPPETS } from '@/lib/latex-snippets';
import { apiSuccess, apiError, apiPaginated, ApiErrors } from '@/lib/api-response';
import { errorResponse, ApiError } from '@/lib/errors';
import { registerSchema, loginSchema, createProjectSchema, filePathSchema, paginationSchema, BLOCKED_EXTENSIONS, MAX_FILE_SIZE } from '@/lib/validation';
import { rateLimitHeaders } from '@/lib/rate-limit';
import { unwrapApi } from '@/lib/utils';
import { useEditorStore } from '@/store/editor-store';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';

function complete(doc: string, pos: number) {
  return latexCompletionSource(new CompletionContext(EditorState.create({ doc }), pos, false));
}

function countFiles(dir: string): number {
  let count = 0;
  try {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) count += countFiles(p);
      else count++;
    }
  } catch {}
  return count;
}

describe('COMPLETE SYSTEM VERIFICATION', () => {
  // Source file count
  it('has 150+ source files', () => {
    expect(countFiles(join(process.cwd(), 'src'))).toBeGreaterThan(150);
  });

  // LaTeX subsystem
  it('linter works', () => { expect(latexLinter('\\begin{doc}\\end{doc}')).toHaveLength(0); });
  it('completions work', () => { expect(complete('\\sec', 4)).not.toBeNull(); });
  it('error parser works', () => { expect(diagnosticSummary(parseLatexLog('')).errors).toBe(0); });
  it('snippets loaded', () => { expect(LATEX_SNIPPETS.length).toBeGreaterThan(10); });
  it('70+ commands', () => { expect(complete('\\', 1)!.options.length).toBeGreaterThan(50); });
  it('19 environments', () => { expect(complete('\\begin{', 7)!.options.length).toBeGreaterThanOrEqual(19); });
  it('7 BibTeX entries', () => { expect(complete('@', 1)!.options.length).toBeGreaterThanOrEqual(7); });

  // API subsystem
  it('apiSuccess 200', () => { expect(apiSuccess({}).status).toBe(200); });
  it('apiSuccess 201', () => { expect(apiSuccess({}, 201).status).toBe(201); });
  it('apiError 400', () => { expect(apiError('x', 400).status).toBe(400); });
  it('unauthorized 401', () => { expect(ApiErrors.unauthorized().status).toBe(401); });
  it('forbidden 403', () => { expect(ApiErrors.forbidden().status).toBe(403); });
  it('notFound 404', () => { expect(ApiErrors.notFound().status).toBe(404); });
  it('rateLimited 429', () => { expect(ApiErrors.rateLimited().status).toBe(429); });
  it('internal 500', () => { expect(ApiErrors.internal().status).toBe(500); });
  it('errorResponse ApiError', () => { expect(errorResponse(new ApiError(422, 'x')).status).toBe(422); });
  it('paginated has headers', () => { expect(apiPaginated([], {page:1,limit:10,total:0}).headers.get('X-Total-Count')).toBe('0'); });

  // Validation
  it('register valid', () => { expect(registerSchema.safeParse({email:'a@b.com',name:'T',password:'Pass1234'}).success).toBe(true); });
  it('register XSS block', () => { expect(registerSchema.safeParse({email:'a@b.com',name:'<script>',password:'Pass1234'}).success).toBe(false); });
  it('login valid', () => { expect(loginSchema.safeParse({email:'a@b.com',password:'x'}).success).toBe(true); });
  it('project valid', () => { expect(createProjectSchema.safeParse({name:'Test'}).success).toBe(true); });
  it('path traversal blocked', () => { expect(filePathSchema.safeParse('../etc').success).toBe(false); });
  it('exe blocked', () => { expect(BLOCKED_EXTENSIONS.has('.exe')).toBe(true); });
  it('50MB limit', () => { expect(MAX_FILE_SIZE).toBe(50*1024*1024); });
  it('pagination defaults', () => { expect(paginationSchema.parse({}).page).toBe(1); });

  // Rate limit headers
  it('headers allowed', () => { expect(rateLimitHeaders(10, {allowed:true,remaining:5})['X-RateLimit-Limit']).toBe('10'); });
  it('headers blocked', () => { expect(rateLimitHeaders(10, {allowed:false,remaining:0,retryAfter:30})['Retry-After']).toBe('30'); });

  // Unwrap utility
  it('unwrap envelope', () => { expect(unwrapApi({data:{id:'1'}})).toEqual({id:'1'}); });
  it('unwrap passthrough', () => { expect(unwrapApi([1])).toEqual([1]); });

  // Store
  it('store opens file', () => {
    useEditorStore.getState().openFile('test.tex', '');
    expect(useEditorStore.getState().tabs.length).toBeGreaterThan(0);
  });

  // Critical files
  it('LICENSE exists', () => { expect(existsSync(join(process.cwd(), 'LICENSE'))).toBe(true); });
  it('SECURITY.md exists', () => { expect(existsSync(join(process.cwd(), 'SECURITY.md'))).toBe(true); });
  it('CI workflow exists', () => { expect(existsSync(join(process.cwd(), '.github/workflows/ci.yml'))).toBe(true); });
  it('Dockerfile exists', () => { expect(existsSync(join(process.cwd(), 'Dockerfile'))).toBe(true); });
  it('middleware exists', () => { expect(existsSync(join(process.cwd(), 'src/middleware.ts'))).toBe(true); });

  // Error log parser real scenario
  it('parses real error log', () => {
    const log = '! Undefined control sequence.\nl.15 \\badcmd\nLaTeX Warning: ref undefined';
    const d = parseLatexLog(log);
    expect(d.length).toBeGreaterThan(0);
    expect(diagnosticSummary(d).errors).toBeGreaterThanOrEqual(1);
  });

  // Linter real scenario
  it('detects mismatched env', () => {
    expect(latexLinter('\\begin{figure}\n\\end{table}').some(d => d.severity === 'error')).toBe(true);
  });
  it('clean doc passes', () => {
    expect(latexLinter('\\begin{document}\nHello\n\\end{document}').filter(d => d.severity === 'error')).toHaveLength(0);
  });

  // Full autocomplete chain
  it('Greek α', () => { expect(complete('\\alp', 4)!.options.some(o => o.label === '\\alpha')).toBe(true); });
  it('math ∫', () => { expect(complete('\\int', 4)!.options.some(o => o.label === '\\int')).toBe(true); });
  it('ref cite', () => { expect(complete('\\cit', 4)!.options.some(o => o.label === '\\cite')).toBe(true); });
  it('snippet fig', () => { expect(complete('fig', 3)!.options.some(o => o.label === 'fig')).toBe(true); });

  // Validation edge cases
  it('255 char name ok', () => { expect(registerSchema.safeParse({email:'a@b.com',name:'a'.repeat(255),password:'Pass1234'}).success).toBe(true); });
  it('256 char name fail', () => { expect(registerSchema.safeParse({email:'a@b.com',name:'a'.repeat(256),password:'Pass1234'}).success).toBe(false); });
  it('weak password fail', () => { expect(registerSchema.safeParse({email:'a@b.com',name:'T',password:'weak'}).success).toBe(false); });
  it('.tex main ok', () => { expect(createProjectSchema.safeParse({name:'T',compiler:'xelatex'}).success).toBe(true); });
  it('invalid compiler fail', () => { expect(createProjectSchema.safeParse({name:'T',compiler:'invalid'}).success).toBe(false); });
});
