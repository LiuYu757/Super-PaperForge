import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('test infrastructure', () => {
  it('vitest.config.ts exists', () => { expect(existsSync(join(process.cwd(), 'vitest.config.ts'))).toBe(true); });
  it('tests/setup.ts exists', () => { expect(existsSync(join(process.cwd(), 'tests/setup.ts'))).toBe(true); });
  it('package has test script', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    expect(pkg.scripts.test).toContain('vitest');
  });
  it('package has test:watch', () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf-8'));
    expect(pkg.scripts['test:watch']).toContain('vitest');
  });
});
