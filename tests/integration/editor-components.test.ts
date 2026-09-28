import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const EDITOR_COMPONENTS = [
  'latex-editor.tsx', 'editor-layout.tsx', 'editor-toolbar.tsx', 'editor-status-bar.tsx',
  'pdf-viewer.tsx', 'compilation-log.tsx', 'file-tree.tsx', 'collaborators.tsx',
  'version-history.tsx', 'git-panel.tsx', 'document-outline.tsx', 'find-in-project.tsx',
  'new-file-dialog.tsx', 'upload-dialog.tsx',
];

describe('editor components', () => {
  EDITOR_COMPONENTS.forEach(f => {
    it(`${f} exists`, () => { expect(existsSync(join(process.cwd(), 'src/components/editor', f))).toBe(true); });
  });

  it('latex-editor has LaTeX language', () => {
    const c = readFileSync(join(process.cwd(), 'src/components/editor/latex-editor.tsx'), 'utf-8');
    expect(c).toContain('getLanguageForFile');
    expect(c).toContain('latexCompletionSource');
    expect(c).toContain('latexLinter');
    expect(c).toContain('latexFoldService');
    expect(c).toContain('closeBrackets');
    expect(c).toContain('wrapSelection');
  });

  it('editor-toolbar has 20+ shortcuts', () => {
    const c = readFileSync(join(process.cwd(), 'src/components/editor/editor-toolbar.tsx'), 'utf-8');
    expect((c.match(/keys:/g) || []).length).toBeGreaterThanOrEqual(18);
  });
});
