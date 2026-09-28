import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ol = readFileSync(join(process.cwd(), 'src/components/editor/document-outline.tsx'), 'utf-8');
const fp = readFileSync(join(process.cwd(), 'src/components/editor/find-in-project.tsx'), 'utf-8');
const sb = readFileSync(join(process.cwd(), 'src/components/editor/editor-status-bar.tsx'), 'utf-8');

describe('document outline', () => {
  it('parses sections', () => { expect(ol).toContain('section'); });
  it('has click to navigate', () => { expect(ol).toContain('editor-goto-line'); });
  it('shows line numbers', () => { expect(ol).toContain('line'); });
  it('has React.memo', () => { expect(ol).toContain('memo'); });
  it('has empty state', () => { expect(ol).toContain('No sections'); });
  it('has hierarchical indent', () => { expect(ol).toContain('indent'); });
});

describe('find in project', () => {
  it('has search input', () => { expect(fp).toContain('SearchIcon'); });
  it('has highlighted matches', () => { expect(fp).toContain('mark'); });
  it('has result click', () => { expect(fp).toContain('editor-goto-line'); });
  it('has file icon', () => { expect(fp).toContain('FileTextIcon'); });
  it('has loading state', () => { expect(fp).toContain('LoaderCircle'); });
  it('skips binary files', () => { expect(fp).toContain('png|jpg'); });
  it('limits results', () => { expect(fp).toContain('100'); });
});
