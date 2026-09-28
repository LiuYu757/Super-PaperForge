import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { BLOCKED_EXTENSIONS } from '@/lib/validation';

/**
 * The file upload route guards against double-extension bypasses
 * (e.g. "exploit.exe.tex"). This asserts both that the BLOCKED_EXTENSIONS
 * set covers the obviously dangerous types and that the route iterates
 * over ALL dotted segments — not just the last one — when applying it.
 */
const uploadRoute = readFileSync(
  join(process.cwd(), 'src/app/api/v1/projects/[id]/files/upload/route.ts'),
  'utf-8',
);

describe('file upload extension policy', () => {
  it('BLOCKED_EXTENSIONS includes the obviously dangerous types', () => {
    for (const ext of ['.exe', '.bat', '.sh', '.ps1', '.js', '.dll', '.php']) {
      expect(BLOCKED_EXTENSIONS.has(ext)).toBe(true);
    }
  });

  it('upload route checks every dotted segment, not just the last', () => {
    // Look for the .slice(1) pattern that produces ALL segments after the
    // first dot; this is what defeats the "evil.exe.tex" trick. Catch both
    // canonical and compact forms.
    expect(uploadRoute).toMatch(/split\(['"]\.['"]\)\.slice\(1\)/);
  });

  it('uses a case-insensitive comparison when matching extensions', () => {
    expect(uploadRoute).toContain('toLowerCase()');
  });

  it('returns 415 BLOCKED_FILE_TYPE when an extension is denied', () => {
    expect(uploadRoute).toContain('BLOCKED_FILE_TYPE');
    expect(uploadRoute).toContain('415');
  });
});
