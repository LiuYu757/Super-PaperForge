import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const el = readFileSync(join(process.cwd(), 'src/components/editor/editor-layout.tsx'), 'utf-8');

describe('editor layout features', () => {
  it('has sidebar toggle', () => { expect(el).toContain('toggleSidebar'); });
  it('has log panel toggle', () => { expect(el).toContain('toggleLogPanel'); });
  it('has tab context menu', () => { expect(el).toContain('tabContextMenu'); });
  it('has close other tabs', () => { expect(el).toContain('closeOtherTabs'); });
  it('has beforeunload warning', () => { expect(el).toContain('beforeunload'); });
  it('has connection status', () => { expect(el).toContain('resolveConnectionState'); });
  it('has offline indicator', () => { expect(el).toContain('WifiOff'); });
  it('shows a reconnect/connecting banner', () => { expect(el).toContain('conn.banner'); });
  it('has find in project', () => { expect(el).toContain('FindInProject'); });
  it('has document outline panel', () => { expect(el).toContain('DocumentOutline'); });
  it('has lazy-loaded panels', () => { expect(el).toContain('lazy'); });
  it('has editor status bar', () => { expect(el).toContain('EditorStatusBar'); });
  it('has compile event listener', () => { expect(el).toContain('latex-compile'); });
  it('has toast notifications', () => { expect(el).toContain('toast'); });
  it('has Suspense for panels', () => { expect(el).toContain('Suspense'); });
});
