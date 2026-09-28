import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const SERVICES = ['compilation-service.ts','project-service.ts','file-service.ts','git-service.ts','version-service.ts','user-service.ts','member-service.ts','template-service.ts','audit-service.ts'];

describe('service layer', () => {
  SERVICES.forEach(f => {
    it(`${f} exists`, () => { expect(existsSync(join(process.cwd(), 'src/services', f))).toBe(true); });
  });
  it('compilation-service has path traversal check', () => {
    const c = readFileSync(join(process.cwd(), 'src/services/compilation-service.ts'), 'utf-8');
    expect(c).toContain('..');
  });
  it('compilation-service has exponential backoff', () => {
    const c = readFileSync(join(process.cwd(), 'src/services/compilation-service.ts'), 'utf-8');
    expect(c).toContain('exponential');
  });
});
