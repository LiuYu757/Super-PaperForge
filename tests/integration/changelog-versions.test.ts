import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const cl = readFileSync(join(process.cwd(), 'CHANGELOG.md'), 'utf-8');

describe('CHANGELOG completeness', () => {
  ['1.0.0','1.1.0','1.3.0','1.5.0','1.7.0','2.0.0','2.2.0','2.3.0','2.5.0','3.1.0'].forEach(v => {
    it(`has version ${v}`, () => { expect(cl).toContain(`## [${v}]`); });
  });
  it('follows Keep a Changelog format', () => { expect(cl).toContain('Keep a Changelog'); });
  it('follows SemVer', () => { expect(cl).toContain('Semantic Versioning'); });
});
