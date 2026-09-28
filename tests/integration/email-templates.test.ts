import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('email system', () => {
  it('email.ts exists', () => { expect(existsSync(join(process.cwd(), 'src/lib/email.ts'))).toBe(true); });
  it('email-templates.ts exists', () => { expect(existsSync(join(process.cwd(), 'src/lib/email-templates.ts'))).toBe(true); });
  it('email has error handling', () => {
    const c = readFileSync(join(process.cwd(), 'src/lib/email.ts'), 'utf-8');
    expect(c).toContain('try');
    expect(c).toContain('catch');
    expect(c).toContain('return false');
  });
  it('email returns boolean', () => {
    const c = readFileSync(join(process.cwd(), 'src/lib/email.ts'), 'utf-8');
    expect(c).toContain('Promise<boolean>');
  });
  it('templates have buttonHtml', () => {
    const c = readFileSync(join(process.cwd(), 'src/lib/email-templates.ts'), 'utf-8');
    expect(c).toContain('buttonHtml');
  });
  it('register route sends email', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/auth/register/route.ts'), 'utf-8');
    expect(c).toContain('sendEmail');
    expect(c).toContain('Verify Email');
  });
  it('forgot-password sends email', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/auth/forgot-password/route.ts'), 'utf-8');
    expect(c).toContain('sendEmail');
    expect(c).toContain('Reset Password');
  });
});
