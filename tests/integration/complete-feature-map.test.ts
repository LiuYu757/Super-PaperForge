import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

describe('complete feature map', () => {
  // Editor features
  const ed = readFileSync(join(process.cwd(), 'src/components/editor/latex-editor.tsx'), 'utf-8');
  it('syntax highlighting', () => { expect(ed).toContain('getLanguageForFile'); });
  it('autocomplete', () => { expect(ed).toContain('latexCompletionSource'); });
  it('linter', () => { expect(ed).toContain('latexLinter'); });
  it('code folding', () => { expect(ed).toContain('latexFoldService'); });
  it('bracket close', () => { expect(ed).toContain('closeBrackets'); });
  it('env auto-close', () => { expect(ed).toContain('\\end{'); });

  // Pages
  it('/pricing exists', () => { expect(existsSync(join(process.cwd(), 'src/app/pricing/page.tsx'))).toBe(true); });
  it('/privacy exists', () => { expect(existsSync(join(process.cwd(), 'src/app/privacy/page.tsx'))).toBe(true); });
  it('/terms exists', () => { expect(existsSync(join(process.cwd(), 'src/app/terms/page.tsx'))).toBe(true); });
  it('/status exists', () => { expect(existsSync(join(process.cwd(), 'src/app/status/page.tsx'))).toBe(true); });
  it('/changelog exists', () => { expect(existsSync(join(process.cwd(), 'src/app/changelog/page.tsx'))).toBe(true); });

  // Infra
  it('middleware', () => { expect(existsSync(join(process.cwd(), 'src/middleware.ts'))).toBe(true); });
  it('OG image', () => { expect(existsSync(join(process.cwd(), 'src/app/opengraph-image.tsx'))).toBe(true); });
  it('PWA manifest', () => { expect(existsSync(join(process.cwd(), 'public/manifest.json'))).toBe(true); });
  it('seed demo', () => { expect(existsSync(join(process.cwd(), 'prisma/seed-demo.ts'))).toBe(true); });
});
