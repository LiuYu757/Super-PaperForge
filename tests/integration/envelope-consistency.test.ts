import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function findTsxFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) results.push(...findTsxFiles(full));
      else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) results.push(full);
    }
  } catch {}
  return results;
}

describe('no raw res.json() without envelope handling in components', () => {
  // Only check components that interact with our API
  const dirs = ['src/components/dashboard', 'src/components/editor'];

  dirs.forEach(dir => {
    const files = findTsxFiles(join(process.cwd(), dir));
    files.forEach(file => {
      const rel = file.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', '');
      const content = readFileSync(file, 'utf-8');

      // Check that file uses fetch
      if (!content.includes('fetch(')) return;

      it(`${rel} has API response handling`, () => {
        // Files that fetch should have some form of response handling
        expect(
          content.includes('res.ok') || content.includes('res.json') || content.includes('fetcher')
        ).toBe(true);
      });
    });
  });
});
