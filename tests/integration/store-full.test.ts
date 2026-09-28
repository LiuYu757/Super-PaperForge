import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/store/editor-store';

describe('editor store full coverage', () => {
  beforeEach(() => {
    useEditorStore.setState({
      tabs: [], activeTab: null, compilationLog: '', compilationStatus: 'idle',
      compilationDuration: null, latestPdfUrl: null, fontSize: 14, wordWrap: true,
      showLineNumbers: true, autoCompileEnabled: true, sidebarCollapsed: false, logPanelCollapsed: false,
    });
  });

  it('openFile detects .cls as latex', () => {
    useEditorStore.getState().openFile('custom.cls', '');
    expect(useEditorStore.getState().tabs[0].language).toBe('latex');
  });
  it('openFile detects .sty as latex', () => {
    useEditorStore.getState().openFile('pkg.sty', '');
    expect(useEditorStore.getState().tabs[0].language).toBe('latex');
  });
  it('openFile detects .md as markdown', () => {
    useEditorStore.getState().openFile('README.md', '');
    expect(useEditorStore.getState().tabs[0].language).toBe('markdown');
  });
  it('openFile detects .json', () => {
    useEditorStore.getState().openFile('data.json', '');
    expect(useEditorStore.getState().tabs[0].language).toBe('json');
  });
  it('openFile detects .yml as yaml', () => {
    useEditorStore.getState().openFile('config.yml', '');
    expect(useEditorStore.getState().tabs[0].language).toBe('yaml');
  });
  it('openFile detects .txt as text', () => {
    useEditorStore.getState().openFile('notes.txt', '');
    expect(useEditorStore.getState().tabs[0].language).toBe('text');
  });
  it('openFile unknown ext defaults text', () => {
    useEditorStore.getState().openFile('file.xyz', '');
    expect(useEditorStore.getState().tabs[0].language).toBe('text');
  });
  it('closeAllTabs resets activeTab', () => {
    useEditorStore.getState().openFile('a.tex', '');
    useEditorStore.getState().openFile('b.tex', '');
    useEditorStore.getState().closeAllTabs();
    expect(useEditorStore.getState().tabs).toHaveLength(0);
    expect(useEditorStore.getState().activeTab).toBeNull();
  });
  it('markSaved per file binds savedSeq and clears dirty (bulk blind markAllSaved was removed)', () => {
    useEditorStore.getState().openFile('a.tex', '');
    useEditorStore.getState().openFile('b.tex', '');
    useEditorStore.getState().updateContent('a.tex', 'x');
    useEditorStore.getState().updateContent('b.tex', 'y');
    const s = useEditorStore.getState();
    for (const path of ['a.tex', 'b.tex']) {
      const t = s.tabs.find((x) => x.path === path)!;
      s.markSaved(path, 'hash-' + path, '1', t.editSeq);
    }
    expect(useEditorStore.getState().tabs.every(t => !t.dirty)).toBe(true);
    expect(useEditorStore.getState().tabs.every(t => t.status === 'clean')).toBe(true);
  });
  it('setShowLineNumbers works', () => {
    useEditorStore.getState().setShowLineNumbers(false);
    expect(useEditorStore.getState().showLineNumbers).toBe(false);
  });
});
