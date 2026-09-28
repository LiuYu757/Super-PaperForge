import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const tw = readFileSync(join(process.cwd(), 'tailwind.config.ts'), 'utf-8');

describe('Tailwind config', () => {
  it('has dark mode class', () => { expect(tw).toContain('darkMode'); });
  it('scans src files', () => { expect(tw).toContain('./src/'); });
  it('has custom colors', () => { expect(tw).toContain('border:'); });
  it('has border radius', () => { expect(tw).toContain('borderRadius'); });
  it('has animate plugin', () => { expect(tw).toContain('tailwindcss-animate'); });
});
