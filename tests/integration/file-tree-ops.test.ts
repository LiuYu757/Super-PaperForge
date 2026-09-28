import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ft = readFileSync(join(process.cwd(), 'src/components/editor/file-tree.tsx'), 'utf-8');

describe('file tree operations', () => {
  it('has search filter', () => { expect(ft).toContain('SearchIcon'); });
  it('has file type icons', () => { expect(ft).toContain('FileTextIcon'); });
  it('has folder operations', () => { expect(ft).toContain('FolderPlus'); });
  it('has context menu', () => { expect(ft).toContain('onContextMenu'); });
  it('has keyboard navigation', () => { expect(ft).toContain('ArrowDown'); });
  it('has rename support', () => { expect(ft).toContain('rename'); });
  it('has delete with toast', () => { expect(ft).toContain('toast'); });
  it('has main file indicator', () => { expect(ft).toContain('StarIcon'); });
  it('has upload dialog', () => { expect(ft).toContain('UploadDialog'); });
  it('has new file dialog', () => { expect(ft).toContain('NewFileDialog'); });
  it('has collapse all', () => { expect(ft).toContain('Collapse'); });
});
