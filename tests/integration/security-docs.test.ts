import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('SECURITY.md', () => {
  const s = readFileSync(join(process.cwd(), 'SECURITY.md'), 'utf-8');
  it('has reporting instructions', () => { expect(s).toContain('report'); });
  it('has response timeline', () => { expect(s).toContain('48 hours'); });
  it('has security measures', () => { expect(s).toContain('AES-256'); });
  it('has supported versions', () => { expect(s).toContain('1.0.x'); });
});

describe('CONTRIBUTING.md', () => {
  const c = readFileSync(join(process.cwd(), 'CONTRIBUTING.md'), 'utf-8');
  it('has setup instructions', () => { expect(c).toContain('npm install'); });
  it('has branch naming', () => { expect(c).toContain('feat/'); });
  it('has commit conventions', () => { expect(c).toContain('Conventional Commits'); });
  it('has PR checklist', () => { expect(c).toContain('Checklist'); });
  it('has test instructions', () => { expect(c).toContain('npm test'); });
});

describe('LICENSE', () => {
  const l = readFileSync(join(process.cwd(), 'LICENSE'), 'utf-8');
  it('is MIT', () => { expect(l).toContain('MIT'); });
});
