import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function findRouteFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) results.push(...findRouteFiles(full));
      else if (entry === 'route.ts') results.push(full);
    }
  } catch {}
  return results;
}

describe('API standardization — all routes use apiSuccess/ApiErrors', () => {
  const routes = findRouteFiles(join(process.cwd(), 'src/app/api/v1'));

  routes.forEach(file => {
    const rel = file.replace(process.cwd() + '\\', '').replace(process.cwd() + '/', '');
    const content = readFileSync(file, 'utf-8');

    // Skip routes that use different patterns
    if (rel.includes('[...nextauth]')) return;
    if (rel.includes('verify-email')) return; // Uses redirect, not JSON
    if ((rel.includes('templates/[id]') || rel.includes('templates\\[id]')) && !rel.includes('admin')) return;
    if (/compile[/\\]\[compileId\][/\\](pdf|docx|synctex)[/\\]route\.ts$/.test(rel)) return;

    it(`${rel} imports api-response`, () => {
      expect(
        content.includes('apiSuccess') || content.includes('ApiErrors') || content.includes('api-response')
      ).toBe(true);
    });
  });
});
