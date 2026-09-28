import { describe, it, expect } from 'vitest';
import { registerSchema, createProjectSchema, updateProjectSchema, inviteMemberSchema, paginationSchema, searchSchema } from '@/lib/validation';

describe('validation edge cases', () => {
  it('register accepts exactly 8 char password', () => {
    expect(registerSchema.safeParse({
      email: 'a@b.com', name: 'Test', password: 'Abcdefg1',
    }).success).toBe(true);
  });

  it('register rejects 128+ char password', () => {
    expect(registerSchema.safeParse({
      email: 'a@b.com', name: 'Test', password: 'A1' + 'a'.repeat(127),
    }).success).toBe(false);
  });

  it('project accepts all three compilers', () => {
    for (const c of ['pdflatex', 'xelatex', 'lualatex']) {
      expect(createProjectSchema.safeParse({ name: 'Test', compiler: c }).success).toBe(true);
    }
  });

  it('updateProject mainFile must end with .tex', () => {
    expect(updateProjectSchema.safeParse({ mainFile: 'doc.pdf' }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ mainFile: 'doc.tex' }).success).toBe(true);
  });

  it('inviteMember role must be editor or viewer', () => {
    expect(inviteMemberSchema.safeParse({ email: 'a@b.com', role: 'editor' }).success).toBe(true);
    expect(inviteMemberSchema.safeParse({ email: 'a@b.com', role: 'viewer' }).success).toBe(true);
    expect(inviteMemberSchema.safeParse({ email: 'a@b.com', role: 'owner' }).success).toBe(false);
    expect(inviteMemberSchema.safeParse({ email: 'a@b.com', role: 'admin' }).success).toBe(false);
  });

  it('pagination defaults are correct', () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.sort).toBe('updatedAt');
    expect(result.order).toBe('desc');
  });

  it('pagination clamps limit to 100', () => {
    expect(paginationSchema.safeParse({ limit: 500 }).success).toBe(false);
  });

  it('search query max 255', () => {
    expect(searchSchema.safeParse({ query: 'a'.repeat(256) }).success).toBe(false);
    expect(searchSchema.safeParse({ query: 'valid search' }).success).toBe(true);
  });
});
