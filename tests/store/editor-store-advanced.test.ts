import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/store/editor-store';

describe('editor store advanced', () => {
  beforeEach(() => {
    useEditorStore.setState({
      tabs: [],
      activeTab: null,
      compilationLog: '',
      compilationStatus: 'idle',
      compilationDuration: null,
      latestPdfUrl: null,
    });
  });

  it('reorderTab swaps tab positions', () => {
    const { openFile } = useEditorStore.getState();
    openFile('a.tex', 'a');
    openFile('b.tex', 'b');
    openFile('c.tex', 'c');

    useEditorStore.getState().reorderTab(0, 2);
    const paths = useEditorStore.getState().tabs.map(t => t.path);
    expect(paths).toEqual(['b.tex', 'c.tex', 'a.tex']);
  });

  it('markSaved per file clears dirty; conflicts are terminal for auto-upload (N07)', () => {
    const { openFile, updateContent } = useEditorStore.getState();
    openFile('a.tex', 'a');
    openFile('b.tex', 'b');
    updateContent('a.tex', 'modified-a');
    updateContent('b.tex', 'modified-b');

    expect(useEditorStore.getState().hasUnsavedChanges()).toBe(true);

    const s = useEditorStore.getState();
    const a = s.tabs.find((t) => t.path === 'a.tex')!;
    s.markSaved('a.tex', 'hash-a', '1', a.editSeq);
    expect(useEditorStore.getState().tabs.find((t) => t.path === 'a.tex')!.dirty).toBe(false);
    expect(useEditorStore.getState().hasUnsavedChanges()).toBe(true); // b still dirty

    // A conflict keeps the local draft dirty and switches the tab into the
    // conflict state — the original baseline is kept, never auto-rebased.
    useEditorStore.getState().markConflict('b.tex', { content: 'server version', sha256: 'server-hash' });
    const conflicted = useEditorStore.getState().tabs.find((t) => t.path === 'b.tex')!;
    expect(conflicted.status).toBe('conflict');
    expect(conflicted.dirty).toBe(true);
    expect(conflicted.content).toBe('modified-b');
    expect(conflicted.remote?.content).toBe('server version');
  });

  it('refreshes only a clean tab still based on the polled version', () => {
    useEditorStore.getState().openFile('main.tex', 'old', 'old-hash', 'file-1');
    useEditorStore.getState().refreshCleanTab('main.tex', 'old-hash', 'remote', 'new-hash', '7');
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      content: 'remote', baseSha256: 'new-hash', lastKnownRevision: '7', dirty: false,
    });
    useEditorStore.getState().refreshCleanTab('main.tex', 'old-hash', 'stale response', 'bad', '6');
    expect(useEditorStore.getState().tabs[0].content).toBe('remote');
    useEditorStore.getState().updateContent('main.tex', 'my draft');
    useEditorStore.getState().refreshCleanTab('main.tex', 'new-hash', 'remote 2', 'newer', '8');
    expect(useEditorStore.getState().tabs[0].content).toBe('my draft');
  });

  it('does not let a late save response clear a remotely detected conflict', () => {
    useEditorStore.getState().openFile('main.tex', 'old', 'old-hash', 'file-1');
    useEditorStore.getState().updateContent('main.tex', 'my draft');
    const seq = useEditorStore.getState().tabs[0].editSeq;
    useEditorStore.getState().markConflict('main.tex', { content: 'remote', sha256: 'remote-hash' });
    useEditorStore.getState().markSaved('main.tex', 'late-hash', '9', seq);
    expect(useEditorStore.getState().tabs[0]).toMatchObject({
      status: 'conflict', content: 'my draft', baseSha256: 'old-hash', dirty: true,
    });
  });

  it('setFontSize updates font size', () => {
    useEditorStore.getState().setFontSize(18);
    expect(useEditorStore.getState().fontSize).toBe(18);
  });

  it('setWordWrap toggles word wrap', () => {
    useEditorStore.getState().setWordWrap(false);
    expect(useEditorStore.getState().wordWrap).toBe(false);
    useEditorStore.getState().setWordWrap(true);
    expect(useEditorStore.getState().wordWrap).toBe(true);
  });

  it('toggleLogPanel toggles state', () => {
    const initial = useEditorStore.getState().logPanelCollapsed;
    useEditorStore.getState().toggleLogPanel();
    expect(useEditorStore.getState().logPanelCollapsed).toBe(!initial);
  });

  it('setLatestPdfUrl stores URL', () => {
    useEditorStore.getState().setLatestPdfUrl('/api/v1/projects/123/compile/456/pdf');
    expect(useEditorStore.getState().latestPdfUrl).toBe('/api/v1/projects/123/compile/456/pdf');
  });

  it('setCompilationDuration stores duration', () => {
    useEditorStore.getState().setCompilationDuration(3500);
    expect(useEditorStore.getState().compilationDuration).toBe(3500);
  });

  it('detects file language from path', () => {
    useEditorStore.getState().openFile('paper.tex', '');
    const tab = useEditorStore.getState().tabs.find(t => t.path === 'paper.tex');
    expect(tab?.language).toBe('latex');
  });

  it('detects bibtex language', () => {
    useEditorStore.getState().openFile('refs.bib', '');
    const tab = useEditorStore.getState().tabs.find(t => t.path === 'refs.bib');
    expect(tab?.language).toBe('bibtex');
  });

  it('closes nearest tab on activeTab close', () => {
    const { openFile, setActiveTab, closeTab } = useEditorStore.getState();
    openFile('a.tex', 'a');
    openFile('b.tex', 'b');
    openFile('c.tex', 'c');
    setActiveTab('c.tex');
    closeTab('c.tex');
    // Should activate b.tex (the tab at the same index, clamped)
    expect(useEditorStore.getState().activeTab).not.toBeNull();
    expect(useEditorStore.getState().activeTab).not.toBe('c.tex');
  });
});
