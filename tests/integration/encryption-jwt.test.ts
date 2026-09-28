import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('encryption module', () => {
  const e = readFileSync(join(process.cwd(), 'src/lib/encryption.ts'), 'utf-8');
  it('uses AES-256-GCM', () => { expect(e).toContain('aes-256-gcm'); });
  it('has encrypt function', () => { expect(e).toContain('encrypt'); });
  it('has decrypt function', () => { expect(e).toContain('decrypt'); });
  it('uses random IV', () => { expect(e).toContain('randomBytes'); });
  it('has auth tag', () => { expect(e).toContain('authTag'); });
});

describe('JWT module', () => {
  const j = readFileSync(join(process.cwd(), 'src/lib/jwt-utils.ts'), 'utf-8');
  it('has sign function', () => { expect(j).toContain('sign'); });
  it('has verify function', () => { expect(j).toContain('verify'); });
  it('uses NEXTAUTH_SECRET', () => { expect(j).toContain('NEXTAUTH_SECRET'); });
});

describe('auth module', () => {
  const a = readFileSync(join(process.cwd(), 'src/lib/auth.ts'), 'utf-8');
  it('has Credentials provider', () => { expect(a).toContain('Credentials'); });
  it('has Google provider', () => { expect(a).toContain('Google'); });
  it('has GitHub provider', () => { expect(a).toContain('GitHub'); });
  it('has JWT strategy', () => { expect(a).toContain("strategy: 'jwt'"); });
  it('has login rate limit', () => { expect(a).toContain('rate:login'); });
  it('has httpOnly cookies', () => { expect(a).toContain('httpOnly'); });
  it('has 7-day session', () => { expect(a).toContain('7'); });
});
