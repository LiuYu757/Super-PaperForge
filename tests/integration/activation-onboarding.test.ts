import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Sprint 2 — persisted activation markers + welcome email (wiring)', () => {
  it('ships the activation-events lib and activation service', () => {
    expect(existsSync(join(process.cwd(), 'src/lib/activation-events.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/services/activation-service.ts'))).toBe(true);
  });

  it('records a persisted marker when a project is created', () => {
    const svc = readFileSync(join(process.cwd(), 'src/services/project-service.ts'), 'utf-8');
    expect(svc).toContain('recordActivationEvent');
    expect(svc).toContain("'created_project'");
  });

  it('verify-email sends a welcome email and records the verified marker only on first verification', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/v1/auth/verify-email/[token]/route.ts'),
      'utf-8',
    );
    // Guarded by the false -> true transition so repeated clicks don't re-send.
    expect(route).toContain('if (!existing.emailVerified)');
    expect(route).toContain('welcomeEmailTemplate');
    expect(route).toContain("recordActivationEvent(userId, 'verified_email')");
  });

  it('welcome email links to templates and docs (the activation value story)', () => {
    const templates = readFileSync(join(process.cwd(), 'src/lib/email-templates.ts'), 'utf-8');
    expect(templates).toContain('welcomeEmailTemplate');
    expect(templates).toContain('templatesUrl');
    expect(templates).toContain('docsUrl');
  });
});
