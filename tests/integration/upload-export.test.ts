import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('file upload route', () => {
  const u = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/files/upload/route.ts'), 'utf-8');
  it('validates file size', () => { expect(u).toContain('MAX_FILE_SIZE'); });
  it('blocks dangerous extensions', () => { expect(u).toContain('BLOCKED_EXTENSIONS'); });
  it('checks path traversal', () => { expect(u).toContain('isValidFilePath'); });
  it('uses apiSuccess', () => { expect(u).toContain('apiSuccess'); });
  it('uses ApiErrors', () => { expect(u).toContain('ApiErrors'); });
});

describe('ZIP export route', () => {
  const e = readFileSync(join(process.cwd(), 'src/app/api/v1/projects/[id]/export/route.ts'), 'utf-8');
  it('has rate limiting', () => { expect(e).toContain('checkRateLimit'); });
  it('generates ZIP', () => { expect(e).toContain('application/zip'); });
  it('has CRC32', () => { expect(e).toContain('crc32'); });
  it('has Content-Disposition', () => { expect(e).toContain('Content-Disposition'); });
  it('uses role check', () => { expect(e).toContain('assertProjectRole'); });
});
