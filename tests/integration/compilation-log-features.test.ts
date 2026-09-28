import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const cl = readFileSync(join(process.cwd(), 'src/components/editor/compilation-log.tsx'), 'utf-8');

describe('compilation log features', () => {
  it('has copy to clipboard', () => { expect(cl).toContain('CopyIcon'); });
  it('has search filter', () => { expect(cl).toContain('SearchIcon'); });
  it('has error highlighting', () => { expect(cl).toContain('error'); });
  it('has warning highlighting', () => { expect(cl).toContain('warning'); });
  it('has line numbers', () => { expect(cl).toContain('lineNumber'); });
  it('has auto-scroll', () => { expect(cl).toContain('scrollIntoView'); });
  it('has expand/collapse', () => { expect(cl).toContain('expanded'); });
  it('has clear button', () => { expect(cl).toContain('TrashIcon'); });
  it('has diagnostics summary', () => { expect(cl).toContain('diagnosticSummary'); });
  it('has clickable errors', () => { expect(cl).toContain('editor-goto-line'); });
});
