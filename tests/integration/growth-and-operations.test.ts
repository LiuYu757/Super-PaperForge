import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('Sprint 9 — campaign attribution (wiring)', () => {
  it('ships the campaign lib and service', () => {
    expect(existsSync(join(process.cwd(), 'src/lib/campaign.ts'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/services/campaign-service.ts'))).toBe(true);
  });

  it('registration captures first-touch attribution fire-and-forget', () => {
    const route = readFileSync(
      join(process.cwd(), 'src/app/api/v1/auth/register/route.ts'),
      'utf-8',
    );
    expect(route).toContain('recordCampaignAttribution');
    // Must not block/await the response — fire-and-forget with a catch.
    expect(route).toMatch(/recordCampaignAttribution\(user\.id, reqBody\)\.catch/);
  });
});

describe('Sprint 10 — operating maturity (operational artifacts)', () => {
  const docs: Array<[string, string[]]> = [
    ['docs/operations/incident-runbooks.md', ['Severity', 'Compilation failures', 'Billing webhook failures']],
    ['docs/operations/release-checklist.md', ['Pre-flight', 'Rollback', 'npm run build']],
    ['docs/operations/support-macros.md', ['Account & auth', 'Billing', 'Escalation']],
    ['docs/operations/billing-smoke-test.md', ['idempotency', 'INVALID_SIGNATURE', 'downgrade']],
    ['docs/operations/kpi-review-template.md', ['Acquisition', 'Activation', 'Monetization']],
  ];

  for (const [path, needles] of docs) {
    it(`${path} exists and covers its key sections`, () => {
      expect(existsSync(join(process.cwd(), path))).toBe(true);
      const content = readFileSync(join(process.cwd(), path), 'utf-8');
      for (const needle of needles) {
        expect(content).toContain(needle);
      }
    });
  }
});
