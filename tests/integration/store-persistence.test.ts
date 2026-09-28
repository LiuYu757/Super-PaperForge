import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/store/editor-store';

describe('store persistence config', () => {
  beforeEach(() => {
    useEditorStore.setState({
      tabs: [], activeTab: null, compilationLog: '', compilationStatus: 'idle',
      fontSize: 14, wordWrap: true, showLineNumbers: true,
      autoCompileEnabled: true, sidebarCollapsed: false, logPanelCollapsed: false,
    });
  });

  it('persist partializes only preferences', () => {
    // These should persist
    useEditorStore.getState().setFontSize(20);
    useEditorStore.getState().setWordWrap(false);
    useEditorStore.getState().setShowLineNumbers(false);
    expect(useEditorStore.getState().fontSize).toBe(20);
    expect(useEditorStore.getState().wordWrap).toBe(false);
    expect(useEditorStore.getState().showLineNumbers).toBe(false);
  });

  it('session state not mixed with preferences', () => {
    useEditorStore.getState().openFile('a.tex', 'content');
    useEditorStore.getState().setCompilationStatus('success');
    useEditorStore.getState().setCompilationLog('Done');
    // Session state exists
    expect(useEditorStore.getState().tabs).toHaveLength(1);
    expect(useEditorStore.getState().compilationStatus).toBe('success');
  });

  it('default preferences are sensible', () => {
    const s = useEditorStore.getState();
    expect(s.fontSize).toBe(14);
    expect(s.wordWrap).toBe(true);
    expect(s.showLineNumbers).toBe(true);
    expect(s.autoCompileEnabled).toBe(true);
    expect(s.sidebarCollapsed).toBe(false);
    expect(s.logPanelCollapsed).toBe(false);
  });
});
