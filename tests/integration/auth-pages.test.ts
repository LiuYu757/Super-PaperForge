import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('auth pages', () => {
  const login = readFileSync(join(process.cwd(), 'src/components/auth/login-form.tsx'), 'utf-8');
  it('login has email field', () => { expect(login).toContain('email'); });
  it('login has password toggle', () => { expect(login).toContain('EyeIcon'); });
  it('login has loading state', () => { expect(login).toContain('LoaderCircle'); });
  it('login has forgot link', () => { expect(login).toContain('forgot'); });

  const reg = readFileSync(join(process.cwd(), 'src/components/auth/register-form.tsx'), 'utf-8');
  it('register has name field', () => { expect(reg).toContain('name'); });
  it('register has confirm password', () => { expect(reg).toContain('confirm'); });
  it('register has ToS checkbox', () => { expect(reg).toContain('Terms'); });

  const forgot = readFileSync(join(process.cwd(), 'src/app/(auth)/forgot-password/page.tsx'), 'utf-8');
  it('forgot has toast', () => { expect(forgot).toContain('toast'); });
  it('forgot has success state', () => { expect(forgot).toContain('submitted'); });

  const reset = readFileSync(join(process.cwd(), 'src/app/(auth)/reset-password/page.tsx'), 'utf-8');
  it('reset has password toggle', () => { expect(reset).toContain('showPassword'); });
  it('reset has match validation', () => { expect(reset).toContain('match'); });
  it('reset has toast', () => { expect(reset).toContain('toast'); });

  const layout = readFileSync(join(process.cwd(), 'src/app/(auth)/layout.tsx'), 'utf-8');
  it('auth layout has branding', () => { expect(layout).toContain('Flame'); });
  it('auth layout has gradient', () => { expect(layout).toContain('gradient'); });
});
