import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const lp = readFileSync(join(process.cwd(), 'src/app/page.tsx'), 'utf-8');

describe('landing page', () => {
  it('is client component', () => { expect(lp).toContain("'use client'"); });
  it('has hero section', () => { expect(lp).toContain('PaperForge'); });
  it('has features section', () => { expect(lp).toContain('features'); });
  it('has comparison table', () => { expect(lp).toContain('Overleaf'); });
  it('has CTA buttons', () => { expect(lp).toContain('Get Started'); });
  it('has testimonials', () => { expect(lp).toContain('testimonial'); });
  it('has footer', () => { expect(lp).toContain('footer'); });
  it('has sign in link', () => { expect(lp).toContain('/login'); });
  it('has register link', () => { expect(lp).toContain('/register'); });
});

describe('pricing page', () => {
  const pp = readFileSync(join(process.cwd(), 'src/app/pricing/page.tsx'), 'utf-8');
  const plans = readFileSync(join(process.cwd(), 'src/lib/billing-plans.ts'), 'utf-8');
  it('has Free plan', () => { expect(plans).toContain("name: 'Free'"); });
  it('has Pro plan', () => { expect(plans).toContain("name: 'Pro'"); });
  it('has Team plan', () => { expect(plans).toContain("name: 'Team'"); });
  it('has price', () => { expect(plans).toContain('monthlyPriceCents: 800'); });
  it('has features list', () => { expect(pp).toContain('CheckIcon'); });
  it('has popular badge', () => { expect(pp).toContain('Popular'); });
});

describe('status page', () => {
  const sp = readFileSync(join(process.cwd(), 'src/app/status/page.tsx'), 'utf-8');
  it('has healthz fetch', () => { expect(sp).toContain('/api/healthz'); });
  it('has auto-refresh', () => { expect(sp).toContain('refreshInterval'); });
  it('has service checks', () => { expect(sp).toContain('checks'); });
});

describe('docs page', () => {
  const dp = readFileSync(join(process.cwd(), 'src/app/docs/page.tsx'), 'utf-8');
  it('has shortcuts reference', () => { expect(dp).toContain('Ctrl+S'); });
  it('has topic cards', () => { expect(dp).toContain('Getting Started'); });
});

describe('changelog page', () => {
  const cp = readFileSync(join(process.cwd(), 'src/app/changelog/page.tsx'), 'utf-8');
  it('has version timeline', () => { expect(cp).toContain('1.0.0'); });
  it('has latest badge', () => { expect(cp).toContain('Latest'); });
});
