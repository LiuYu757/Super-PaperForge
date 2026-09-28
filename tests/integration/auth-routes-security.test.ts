import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('auth routes have rate limiting', () => {
  const routes = [
    { file: 'src/app/api/v1/auth/register/route.ts', key: 'rate:register' },
    { file: 'src/app/api/v1/auth/forgot-password/route.ts', key: 'rate:forgot' },
    { file: 'src/app/api/v1/auth/reset-password/route.ts', key: 'rate:reset' },
  ];

  routes.forEach(({ file, key }) => {
    it(`${file.split('/').pop()} has checkRateLimit`, () => {
      const c = readFileSync(join(process.cwd(), file), 'utf-8');
      expect(c).toContain('checkRateLimit');
    });
    it(`${file.split('/').pop()} uses ${key} key`, () => {
      const c = readFileSync(join(process.cwd(), file), 'utf-8');
      expect(c).toContain(key);
    });
  });

  it('auth.ts has login rate limiting', () => {
    const c = readFileSync(join(process.cwd(), 'src/lib/auth.ts'), 'utf-8');
    expect(c).toContain('checkRateLimit');
    expect(c).toContain('rate:login');
    expect(c).toContain('rate:login-ip');
  });

  it('auth.ts logs anonymous login rate-limit denials', () => {
    const c = readFileSync(join(process.cwd(), 'src/lib/auth.ts'), 'utf-8');
    expect(c).toContain('login.rate_limited');
    expect(c).toContain('reason: \'ip\'');
    expect(c).toContain('reason: \'email\'');
    // Should be fire-and-forget to avoid impacting auth UX
    expect(c).toMatch(/logAuditAction\(null, 'login\.rate_limited'[\s\S]*\.catch\(\(\)\s*=>\s*\{\}\)/);
  });

  it('auth.ts has cookie hardening', () => {
    const c = readFileSync(join(process.cwd(), 'src/lib/auth.ts'), 'utf-8');
    expect(c).toContain('httpOnly');
    expect(c).toContain('sameSite');
  });

  it('change-password audit log snapshots actor email before later account deletion', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/auth/change-password/route.ts'), 'utf-8');
    // email is fetched before the update so it's available even if the account is later deleted
    expect(c).toContain('email: true');
    // logAuditAction receives user.email as the actor identifier
    expect(c).toContain('logAuditAction');
    expect(c).toContain('user.email');
  });

  it('verify-email route has IP rate limiting', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/auth/verify-email/[token]/route.ts'), 'utf-8');
    expect(c).toContain('checkRateLimit');
    expect(c).toContain('rate:verify-email:');
    expect(c).toContain('VERIFY_EMAIL');
    expect(c).toContain('rateLimitHeaders');
  });

  it('verify-email route emits audit event on success', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/auth/verify-email/[token]/route.ts'), 'utf-8');
    expect(c).toContain('logAuditAction');
    expect(c).toContain('email_verified');
  });

  it('change-password route has per-user rate limiting', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/auth/change-password/route.ts'), 'utf-8');
    expect(c).toContain('enforceRateLimit');
    expect(c).toContain('rate:change-pw:');
    expect(c).toContain('CHANGE_PASSWORD');
  });

  it('register route emits audit event for new accounts', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/auth/register/route.ts'), 'utf-8');
    expect(c).toContain('logAuditAction');
    expect(c).toContain('user.register');
  });

  it('register route uses REGISTER constant for rate-limit headers', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/auth/register/route.ts'), 'utf-8');
    expect(c).toContain('RATE_LIMITS.REGISTER.limit');
  });

  it('VERIFY_EMAIL and CHANGE_PASSWORD rate-limit constants are defined', () => {
    const c = readFileSync(join(process.cwd(), 'src/lib/constants.ts'), 'utf-8');
    expect(c).toContain('VERIFY_EMAIL');
    expect(c).toContain('CHANGE_PASSWORD');
  });

  it('forgot-password route emits audit event when user is found', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/auth/forgot-password/route.ts'), 'utf-8');
    expect(c).toContain('logAuditAction');
    expect(c).toContain('forgot_password');
    // Must be fire-and-forget so audit never breaks the auth flow
    expect(c).toMatch(/logAuditAction[\s\S]*\.catch\(\(\)\s*=>\s*\{\}\)/);
    expect(c).toContain('FORGOT_PASSWORD');
    expect(c).toContain('rateLimitHeaders');
  });

  it('reset-password route has rate-limit headers when rejected', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/auth/reset-password/route.ts'), 'utf-8');
    expect(c).toContain('checkRateLimit');
    expect(c).toContain('rateLimitHeaders');
    expect(c).toContain('RESET_PASSWORD');
  });

  it('profile PATCH has per-user rate limiting', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/user/profile/route.ts'), 'utf-8');
    expect(c).toContain('enforceRateLimit');
    expect(c).toContain('rate:profile-update:');
    expect(c).toContain('PROFILE_UPDATE');
  });

  it('settings PATCH has per-user rate limiting', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/user/settings/route.ts'), 'utf-8');
    expect(c).toContain('enforceRateLimit');
    expect(c).toContain('rate:settings-update:');
    expect(c).toContain('SETTINGS_UPDATE');
  });

  it('PROFILE_UPDATE and SETTINGS_UPDATE rate-limit constants are defined', () => {
    const c = readFileSync(join(process.cwd(), 'src/lib/constants.ts'), 'utf-8');
    expect(c).toContain('PROFILE_UPDATE');
    expect(c).toContain('SETTINGS_UPDATE');
  });

  it('compile route has rate limiting', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/compile/route.ts'), 'utf-8');
    expect(c).toContain('checkRateLimit');
    expect(c).toContain('rateLimitHeaders');
  });

  it('export route has rate limiting', () => {
    const c = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/export/route.ts'), 'utf-8');
    expect(c).toContain('checkRateLimit');
    expect(c).toContain('rateLimitHeaders');
  });
});
