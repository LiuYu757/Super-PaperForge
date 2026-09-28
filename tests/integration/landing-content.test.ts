import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const lp = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf-8');

describe('landing page content', () => {
  it('has stats section', () => { expect(lp).toContain('Tests Passing'); });
  it('has how-it-works', () => { expect(lp).toContain('how-it-works'); });
  it('has social links', () => { expect(lp).toContain('github'); });
  it('has MIT license', () => { expect(lp).toContain('MIT'); });
  it('has responsive grid', () => { expect(lp).toContain('grid'); });
  it('has background styling', () => { expect(lp).toContain('bg-'); });
  it('has animations', () => { expect(lp).toContain('transition'); });
  it('has orange branding', () => { expect(lp).toContain('orange'); });
  it('has nav links', () => { expect(lp).toContain('#features'); });
  it('has feature cards', () => { expect(lp).toContain('Card'); });
});

describe('pricing page content', () => {
  const pp = readFileSync(join(process.cwd(), 'src/app/pricing/page.tsx'), 'utf-8');
  const billingPlans = readFileSync(join(process.cwd(), 'src/lib/billing-plans.ts'), 'utf-8');
  it('uses centralized plans', () => { expect(pp).toContain('BILLING_PLAN_LIST'); });
  it('has storage limits', () => { expect(billingPlans).toContain('GB'); });
  it('has CTA buttons', () => { expect(pp).toContain('Start'); });
  it('has popular badge', () => { expect(pp).toContain('Most Popular'); });
});
