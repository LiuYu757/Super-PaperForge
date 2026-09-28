import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ed = readFileSync(join(process.cwd(), 'src/components/editor/latex-editor.tsx'), 'utf-8');

describe('LaTeX editor features', () => {
  it('has Yjs CRDT', () => { expect(ed).toContain('yCollab'); });
  it('has WebSocket provider', () => { expect(ed).toContain('WebsocketProvider'); });
  it('has save shortcut', () => { expect(ed).toContain('Ctrl-s'); });
  it('has compile shortcut', () => { expect(ed).toContain('Ctrl-Enter'); });
  it('has go-to-line', () => { expect(ed).toContain('Ctrl-g'); });
  it('has comment toggle', () => { expect(ed).toContain('Ctrl-/'); });
  it('has bold wrap', () => { expect(ed).toContain('Ctrl-b'); });
  it('has italic wrap', () => { expect(ed).toContain('Ctrl-i'); });
  it('has math wrap', () => { expect(ed).toContain('Ctrl-m'); });
  it('has duplicate line', () => { expect(ed).toContain('Ctrl-Shift-d'); });
  it('has delete line', () => { expect(ed).toContain('Ctrl-Shift-k'); });
  it('has select line', () => { expect(ed).toContain('Ctrl-l'); });
  it('has move line', () => { expect(ed).toContain('Alt-ArrowUp'); });
  it('has env auto-close', () => { expect(ed).toContain('\\end{'); });
  it('has latex-insert listener', () => { expect(ed).toContain('latex-insert'); });
  it('has goto-line listener', () => { expect(ed).toContain('editor-goto-line'); });
  it('has connection tracking', () => { expect(ed).toContain('onConnectionChange'); });
  it('has theme reconfiguration', () => { expect(ed).toContain('themeCompartment'); });
  it('has closeBrackets', () => { expect(ed).toContain('closeBrackets'); });
  it('has lintGutter', () => { expect(ed).toContain('lintGutter'); });
});
