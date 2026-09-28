import { describe, it, expect } from 'vitest';
import { apiSuccess, apiError, apiPaginated, apiValidationError, ApiErrors } from '@/lib/api-response';
import { errorResponse, ApiError } from '@/lib/errors';
import { rateLimitHeaders } from '@/lib/rate-limit';
import { registerSchema, createProjectSchema, updateProjectSchema, inviteMemberSchema, changePasswordSchema, filePathSchema, paginationSchema, searchSchema, BLOCKED_EXTENSIONS, MAX_FILE_SIZE } from '@/lib/validation';
import { latexLinter } from '@/lib/latex-linter';
import { parseLatexLog, diagnosticSummary } from '@/lib/latex-error-parser';
import { LATEX_SNIPPETS } from '@/lib/latex-snippets';
import { ZodError, ZodIssueCode } from 'zod';

describe('full system coverage', () => {
  // API layer
  it('apiSuccess with null data', async () => { expect((await apiSuccess(null).json()).data).toBeNull(); });
  it('apiSuccess with array', async () => { expect((await apiSuccess([1,2]).json()).data).toEqual([1,2]); });
  it('apiError default code', async () => { expect((await apiError('x', 400).json()).error.code).toBe('ERR_400'); });
  it('ApiErrors.conflict', async () => { expect((await ApiErrors.conflict('dup').json()).error.message).toBe('dup'); });
  it('ApiErrors.internal default msg', async () => { expect((await ApiErrors.internal().json()).error.message).toBe('Internal server error'); });
  it('errorResponse unknown', async () => { expect((await errorResponse(42).json()).error.code).toBe('INTERNAL_ERROR'); });
  it('apiPaginated single page', async () => { const b = await apiPaginated([1], {page:1,limit:10,total:1}).json(); expect(b.pagination.pages).toBe(1); });

  // Rate limit
  it('rateLimitHeaders no retryAfter', () => { const h = rateLimitHeaders(5, {allowed:true,remaining:3}); expect(h['Retry-After']).toBeUndefined(); });

  // Validation
  it('register max email length', () => { expect(registerSchema.safeParse({email:'a'.repeat(250)+'@b.c',name:'T',password:'Valid1xx'}).success).toBe(false); });
  it('createProject empty name', () => { expect(createProjectSchema.safeParse({name:''}).success).toBe(false); });
  it('updateProject all optional', () => { expect(updateProjectSchema.safeParse({}).success).toBe(true); });
  it('inviteMember invalid email', () => { expect(inviteMemberSchema.safeParse({email:'bad',role:'editor'}).success).toBe(false); });
  it('changePassword matching', () => { expect(changePasswordSchema.safeParse({currentPassword:'Old1pass',newPassword:'New1pass',confirmPassword:'New1pass'}).success).toBe(true); });
  it('filePath max length ok', () => { expect(filePathSchema.safeParse('a'.repeat(1024)).success).toBe(true); });
  it('pagination negative page', () => { expect(paginationSchema.safeParse({page:-1}).success).toBe(false); });
  it('search empty', () => { expect(searchSchema.safeParse({}).success).toBe(true); });

  // Linter
  it('linter \\ned typo', () => { expect(latexLinter('\\ned{doc}').some(d=>d.message.includes('\\end'))).toBe(true); });
  it('linter clean single line', () => { expect(latexLinter('Hello world')).toHaveLength(0); });

  // Snippets
  it('snippets all have apply', () => { LATEX_SNIPPETS.forEach(s => expect(typeof s.apply).toBe('string')); });
});
