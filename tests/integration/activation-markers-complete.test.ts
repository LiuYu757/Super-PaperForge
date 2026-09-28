import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The full activation funnel is wired: each marker is recorded at its natural
 * hook, fire-and-forget so it never affects the primary operation.
 */
describe('activation markers — complete funnel wiring', () => {
  const cases: Array<[string, string, string]> = [
    ['src/services/project-service.ts', 'created_project', 'project creation'],
    ['src/app/api/v1/auth/verify-email/[token]/route.ts', 'verified_email', 'email verification'],
    ['src/app/api/v1/projects/[id]/files/[...path]/route.ts', 'added_content', 'file write'],
    ['src/services/member-service.ts', 'invited_collaborator', 'member invite'],
    ['src/app/api/v1/billing/checkout/route.ts', 'reviewed_billing', 'checkout start'],
  ];

  for (const [file, marker, where] of cases) {
    it(`records ${marker} at ${where}`, () => {
      const src = readFileSync(join(process.cwd(), file), 'utf-8');
      expect(src).toContain('recordActivationEvent');
      expect(src).toContain(`'${marker}'`);
      // Must be fire-and-forget (never awaited into the response path).
      expect(src).toMatch(new RegExp(`recordActivationEvent\\([^)]*'${marker}'\\)\\.catch`));
    });
  }

  it('every activation event id is covered by a wiring', () => {
    const ids = readFileSync(join(process.cwd(), 'src/lib/activation-events.ts'), 'utf-8');
    const declared = ['verified_email', 'created_project', 'added_content', 'invited_collaborator', 'reviewed_billing'];
    for (const id of declared) {
      expect(ids).toContain(`'${id}'`);
    }
  });
});
