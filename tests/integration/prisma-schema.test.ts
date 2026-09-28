import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const schema = readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf-8');

describe('Prisma schema', () => {
  const models = ['User','OAuthAccount','Project','ProjectMember','File','Compilation','Version','Template','GitCredential','ShareLink','AuditLog'];
  models.forEach(m => { it(`has model ${m}`, () => { expect(schema).toContain(`model ${m}`); }); });

  it('has 8+ indexes', () => { expect((schema.match(/@@index/g) || []).length).toBeGreaterThanOrEqual(8); });
  it('uses UUID ids', () => { expect(schema).toContain('gen_random_uuid()'); });
  it('has soft delete on Project', () => { expect(schema).toContain('deletedAt'); });
  it('has storage quota on User', () => { expect(schema).toContain('storageQuotaBytes'); });
});
