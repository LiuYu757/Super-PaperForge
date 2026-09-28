import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const pv = readFileSync(join(process.cwd(), 'src/components/editor/pdf-viewer.tsx'), 'utf-8');

describe('PDF viewer features', () => {
  it('has keyboard navigation', () => { expect(pv).toContain('ArrowDown'); });
  it('has zoom controls', () => { expect(pv).toContain('scale'); });
  it('has fullscreen', () => { expect(pv).toContain('fullscreen'); });
  it('has page jump input', () => { expect(pv).toContain('pageInput'); });
  it('has download button', () => { expect(pv).toContain('download'); });
});
