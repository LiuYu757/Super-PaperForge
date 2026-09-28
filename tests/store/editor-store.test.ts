import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/store/editor-store';

describe('useEditorStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useEditorStore.setState({
      tabs: [],
      activeTab: null,
      compilationLog: '',
      compilationStatus: 'idle',
      compilationDuration: null,
      latestPdfUrl: null,
    });
  });

  it('opens a file and sets it as active', () => {
    useEditorStore.getState().openFile('main.tex', '\\documentclass{article}');
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].path).toBe('main.tex');
    expect(state.tabs[0].dirty).toBe(false);
    expect(state.activeTab).toBe('main.tex');
  });

  it('does not duplicate tabs for same file', () => {
    const { openFile } = useEditorStore.getState();
    openFile('main.tex', 'content');
    openFile('main.tex', 'content');
    expect(useEditorStore.getState().tabs).toHaveLength(1);
  });

  it('closes a tab and activates nearest', () => {
    const { openFile } = useEditorStore.getState();
    openFile('a.tex', 'a');
    openFile('b.tex', 'b');
    openFile('c.tex', 'c');
    useEditorStore.getState().setActiveTab('b.tex');

    useEditorStore.getState().closeTab('b.tex');
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(2);
    expect(state.activeTab).not.toBe('b.tex');
  });

  it('closes other tabs', () => {
    const { openFile } = useEditorStore.getState();
    openFile('a.tex', 'a');
    openFile('b.tex', 'b');
    openFile('c.tex', 'c');

    useEditorStore.getState().closeOtherTabs('b.tex');
    const state = useEditorStore.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.tabs[0].path).toBe('b.tex');
    expect(state.activeTab).toBe('b.tex');
  });

  it('closes all tabs', () => {
    const { openFile } = useEditorStore.getState();
    openFile('a.tex', 'a');
    openFile('b.tex', 'b');

    useEditorStore.getState().closeAllTabs();
    expect(useEditorStore.getState().tabs).toHaveLength(0);
    expect(useEditorStore.getState().activeTab).toBeNull();
  });

  it('marks content as dirty on update', () => {
    useEditorStore.getState().openFile('main.tex', 'old');
    useEditorStore.getState().updateContent('main.tex', 'new');

    const tab = useEditorStore.getState().tabs[0];
    expect(tab.dirty).toBe(true);
    expect(tab.content).toBe('new');
  });

  it('marks saved clears dirty flag', () => {
    useEditorStore.getState().openFile('main.tex', 'old');
    useEditorStore.getState().updateContent('main.tex', 'new');
    useEditorStore.getState().markSaved('main.tex', 'new-sha');

    expect(useEditorStore.getState().tabs[0].dirty).toBe(false);
  });

  it('hasUnsavedChanges returns true when tabs are dirty', () => {
    useEditorStore.getState().openFile('main.tex', 'old');
    useEditorStore.getState().updateContent('main.tex', 'new');

    expect(useEditorStore.getState().hasUnsavedChanges()).toBe(true);
  });

  it('hasUnsavedChanges returns false when all saved', () => {
    useEditorStore.getState().openFile('main.tex', 'old');
    expect(useEditorStore.getState().hasUnsavedChanges()).toBe(false);
  });

  it('toggles auto-compile', () => {
    const initial = useEditorStore.getState().autoCompileEnabled;
    useEditorStore.getState().toggleAutoCompile();
    expect(useEditorStore.getState().autoCompileEnabled).toBe(!initial);
  });

  it('toggles sidebar', () => {
    const initial = useEditorStore.getState().sidebarCollapsed;
    useEditorStore.getState().toggleSidebar();
    expect(useEditorStore.getState().sidebarCollapsed).toBe(!initial);
  });

  it('sets compilation status and log', () => {
    useEditorStore.getState().setCompilationStatus('compiling');
    useEditorStore.getState().setCompilationLog('Running pdflatex...');

    const state = useEditorStore.getState();
    expect(state.compilationStatus).toBe('compiling');
    expect(state.compilationLog).toBe('Running pdflatex...');
  });
});
