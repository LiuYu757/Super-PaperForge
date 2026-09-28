import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const sb = readFileSync(join(process.cwd(), 'src/components/editor/editor-status-bar.tsx'), 'utf-8');

describe('editor status bar', () => {
  it('has word count', () => { expect(sb).toContain('words'); });
  it('has line count', () => { expect(sb).toContain('lines'); });
  it('has char count', () => { expect(sb).toContain('chars'); });
  it('has file type detection', () => { expect(sb).toContain('getFileType'); });
  it('has word goal', () => { expect(sb).toContain('wordGoal'); });
  it('has progress bar', () => { expect(sb).toContain('goalProgress'); });
  it('has debounced stats', () => { expect(sb).toContain('setTimeout'); });
  it('has LaTeX-aware counting', () => { expect(sb).toContain('replace'); });
  it('has font size display', () => { expect(sb).toContain('fontSize'); });
  it('has modified indicator', () => { expect(sb).toContain('Modified'); });
  it('has UTF-8 encoding', () => { expect(sb).toContain('UTF-8'); });
  it('has localStorage goal', () => { expect(sb).toContain('localStorage'); });
});
