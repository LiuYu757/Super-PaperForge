'use client';

import { useEffect, useRef } from 'react';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightActiveLine, drawSelection, dropCursor } from '@codemirror/view';
import { EditorState, Compartment } from '@codemirror/state';
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import { foldGutter, foldKeymap, syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { linter, lintGutter } from '@codemirror/lint';
import { oneDark } from '@codemirror/theme-one-dark';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { yCollab } from 'y-codemirror.next';
import { useEditorStore } from '@/store/editor-store';
import { latexCompletionSource } from '@/lib/latex-completions';
import { getLanguageForFile } from '@/lib/latex-language';
import { latexLinter } from '@/lib/latex-linter';
import { latexFoldService } from '@/lib/latex-fold';
import { clientEnv } from '@/lib/client-env';
import type { ProviderStatus } from '@/lib/connection-status';

interface LaTeXEditorProps {
  initialContent: string;
  filePath: string;
  projectId: string;
  theme?: 'light' | 'dark';
  readOnly?: boolean;
  onSave?: (content: string) => void;
  onProviderReady?: (provider: WebsocketProvider) => void;
  onConnectionChange?: (status: ProviderStatus) => void;
}

const themeCompartment = new Compartment();
const wrapCompartment = new Compartment();

const WS_BASE = clientEnv.NEXT_PUBLIC_WS_URL || '';

/** Wrap the current selection with prefix/suffix, or insert at cursor if no selection. */
function wrapSelection(view: EditorView, prefix: string, suffix: string): boolean {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const wrapped = `${prefix}${selected}${suffix}`;
  view.dispatch({
    changes: { from, to, insert: wrapped },
    selection: selected
      ? { anchor: from, head: from + wrapped.length }
      : { anchor: from + prefix.length },
  });
  return true;
}

export function LaTeXEditor({ initialContent, filePath, projectId, theme = 'light', readOnly = false, onSave, onProviderReady, onConnectionChange }: LaTeXEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const updateContent = useEditorStore((s) => s.updateContent);

  useEffect(() => {
    if (!editorRef.current) return;

    // --- Yjs setup (only when WebSocket URL is configured) ---
    let ydoc: Y.Doc | null = null;
    let provider: WebsocketProvider | null = null;
    let ytext: Y.Text | null = null;
    let handleStatus: (({ status }: { status: string }) => void) | null = null;
    let handleSync: ((synced: boolean) => void) | null = null;

    if (WS_BASE) {
      ydoc = new Y.Doc();
      const wsUrl = `${WS_BASE}/ws/${projectId}`;
      provider = new WebsocketProvider(wsUrl, projectId, ydoc);
      onProviderReady?.(provider);

      // --- Connection status tracking ---
      handleStatus = ({ status }: { status: string }) => {
        // y-websocket emits 'connected' | 'connecting' | 'disconnected'.
        onConnectionChange?.(status as ProviderStatus);
      };
      provider.on('status', handleStatus);

      // Use filePath as the key for the shared text within the project doc
      ytext = ydoc.getText(filePath);

      // Initialise ytext with the existing content only when the doc is empty
      // (first load / no remote state yet). Once remote state syncs it will
      // override this, which is the correct CRDT behaviour.
      handleSync = (synced: boolean) => {
        if (synced && ytext!.length === 0 && initialContent) {
          ytext!.insert(0, initialContent);
        }
      };
      provider.on('sync', handleSync);
    } else {
      // No WebSocket configured — single-user mode, no collaboration. Report
      // 'connected'; the editor layout renders single-user from wsConfigured.
      onConnectionChange?.('connected');
    }

    const saveKeymap = keymap.of([
      {
        key: 'Ctrl-s',
        mac: 'Cmd-s',
        run(view) {
          if (onSave) onSave(view.state.doc.toString());
          return true;
        },
      },
      {
        key: 'Ctrl-Enter',
        mac: 'Cmd-Enter',
        run() {
          window.dispatchEvent(new CustomEvent('latex-compile'));
          return true;
        },
      },
      {
        key: 'Ctrl-g',
        mac: 'Cmd-g',
        run(view) {
          // Use a non-blocking approach: dispatch event to show go-to-line UI
          // Fallback to prompt() if no listener handles it
          const lineCount = view.state.doc.lines;
          const input = prompt(`Go to line (1-${lineCount}):`);
          if (!input) return true;
          const line = parseInt(input, 10);
          if (isNaN(line) || line < 1) return true;
          const target = Math.min(line, lineCount);
          const lineInfo = view.state.doc.line(target);
          view.dispatch({
            selection: { anchor: lineInfo.from },
            effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
          });
          view.focus();
          return true;
        },
      },
      {
        key: 'Ctrl-b',
        mac: 'Cmd-b',
        run(view) { return wrapSelection(view, '\\textbf{', '}'); },
      },
      {
        key: 'Ctrl-i',
        mac: 'Cmd-i',
        run(view) { return wrapSelection(view, '\\textit{', '}'); },
      },
      {
        key: 'Ctrl-u',
        mac: 'Cmd-u',
        run(view) { return wrapSelection(view, '\\underline{', '}'); },
      },
      {
        key: 'Ctrl-m',
        mac: 'Cmd-m',
        run(view) { return wrapSelection(view, '$', '$'); },
      },
      {
        key: 'Ctrl-/',
        mac: 'Cmd-/',
        run(view) {
          const { from, to } = view.state.selection.main;
          const fromLine = view.state.doc.lineAt(from).number;
          const toLine = view.state.doc.lineAt(to).number;
          const changes: Array<{ from: number; to?: number; insert?: string }> = [];

          // Check if all selected lines are already commented
          let allCommented = true;
          for (let l = fromLine; l <= toLine; l++) {
            const line = view.state.doc.line(l);
            if (!line.text.trimStart().startsWith('%')) {
              allCommented = false;
              break;
            }
          }

          for (let l = fromLine; l <= toLine; l++) {
            const line = view.state.doc.line(l);
            if (allCommented) {
              // Uncomment: remove first % (and optional space after)
              const idx = line.text.indexOf('%');
              if (idx !== -1) {
                const end = line.text[idx + 1] === ' ' ? idx + 2 : idx + 1;
                changes.push({ from: line.from + idx, to: line.from + end });
              }
            } else {
              // Comment: add % at start
              changes.push({ from: line.from, insert: '% ' });
            }
          }

          view.dispatch({ changes });
          return true;
        },
      },
      {
        key: 'Ctrl-Shift-d',
        mac: 'Cmd-Shift-d',
        run(view) {
          const { from, to } = view.state.selection.main;
          const fromLine = view.state.doc.lineAt(from);
          const toLine = view.state.doc.lineAt(to);
          const text = view.state.sliceDoc(fromLine.from, toLine.to);
          view.dispatch({
            changes: { from: toLine.to, insert: '\n' + text },
            selection: { anchor: toLine.to + 1 + (from - fromLine.from), head: toLine.to + 1 + (to - fromLine.from) },
          });
          return true;
        },
      },
      {
        key: 'Alt-ArrowUp',
        run(view) {
          const { from, to } = view.state.selection.main;
          const fromLine = view.state.doc.lineAt(from);
          if (fromLine.number <= 1) return true;
          const toLine = view.state.doc.lineAt(to);
          const prevLine = view.state.doc.line(fromLine.number - 1);
          const selected = view.state.sliceDoc(fromLine.from, toLine.to);
          view.dispatch({
            changes: [
              { from: prevLine.from, to: toLine.to, insert: selected + '\n' + prevLine.text },
            ],
            selection: { anchor: prevLine.from + (from - fromLine.from), head: prevLine.from + (to - fromLine.from) },
          });
          return true;
        },
      },
      {
        key: 'Alt-ArrowDown',
        run(view) {
          const { from, to } = view.state.selection.main;
          const fromLine = view.state.doc.lineAt(from);
          const toLine = view.state.doc.lineAt(to);
          if (toLine.number >= view.state.doc.lines) return true;
          const nextLine = view.state.doc.line(toLine.number + 1);
          const selected = view.state.sliceDoc(fromLine.from, toLine.to);
          view.dispatch({
            changes: [
              { from: fromLine.from, to: nextLine.to, insert: nextLine.text + '\n' + selected },
            ],
            selection: { anchor: fromLine.from + nextLine.text.length + 1 + (from - fromLine.from), head: fromLine.from + nextLine.text.length + 1 + (to - fromLine.from) },
          });
          return true;
        },
      },
      {
        key: 'Enter',
        run(view) {
          // Auto-close \begin{env} → insert \end{env}
          const pos = view.state.selection.main.head;
          const line = view.state.doc.lineAt(pos);
          const match = line.text.match(/^(\s*)\\begin\{([^}]+)\}\s*$/);
          if (match && pos === line.to) {
            const indent = match[1];
            const env = match[2];
            const insert = `\n${indent}  \n${indent}\\end{${env}}`;
            view.dispatch({
              changes: { from: pos, insert },
              selection: { anchor: pos + indent.length + 3 },
            });
            return true;
          }
          return false; // fall through to default Enter
        },
      },
      {
        key: 'Ctrl-l',
        mac: 'Cmd-l',
        run(view) {
          const line = view.state.doc.lineAt(view.state.selection.main.head);
          view.dispatch({ selection: { anchor: line.from, head: line.to } });
          return true;
        },
      },
      {
        key: 'Ctrl-Shift-k',
        mac: 'Cmd-Shift-k',
        run(view) {
          const pos = view.state.selection.main.head;
          const line = view.state.doc.lineAt(pos);
          const from = line.from;
          const to = line.number < view.state.doc.lines ? line.to + 1 : line.from > 0 ? line.from - 1 : line.to;
          view.dispatch({ changes: { from: Math.min(from, to), to: Math.max(from, to) } });
          return true;
        },
      },
    ]);

    const startState = EditorState.create({
      doc: ytext ? ytext.toString() || initialContent : initialContent,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        dropCursor(),
        history(),
        foldGutter(),
        bracketMatching(),
        closeBrackets(),
        getLanguageForFile(filePath),
        latexFoldService,
        lintGutter(),
        linter((view) => latexLinter(view.state.doc.toString()), { delay: 1000 }),
        autocompletion({ override: [latexCompletionSource] }),
        search({ top: true }),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...searchKeymap,
          ...completionKeymap,
          ...closeBracketsKeymap,
          indentWithTab,
        ]),
        saveKeymap,
        themeCompartment.of(theme === 'dark' ? oneDark : []),
        wrapCompartment.of(useEditorStore.getState().wordWrap ? EditorView.lineWrapping : []),
        EditorView.contentAttributes.of({ spellcheck: 'true', autocorrect: 'on' }),
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.theme({
          '&': { height: '100%', minHeight: '0' },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: useEditorStore.getState().fontFamily,
            fontSize: `${useEditorStore.getState().fontSize}px`,
            lineHeight: String(useEditorStore.getState().lineHeight),
          },
          // Bracket pair colorization
          '.cm-matchingBracket': {
            backgroundColor: 'rgba(249, 115, 22, 0.15)',
            borderBottom: '1px solid #f97316',
            color: 'inherit',
          },
          '.cm-nonmatchingBracket': {
            backgroundColor: 'rgba(239, 68, 68, 0.2)',
            borderBottom: '1px solid #ef4444',
          },
          // Active line highlight
          '.cm-activeLine': {
            backgroundColor: 'rgba(249, 115, 22, 0.04)',
          },
          '.cm-activeLineGutter': {
            backgroundColor: 'rgba(249, 115, 22, 0.08)',
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            updateContent(filePath, update.state.doc.toString());
          }
          if (update.selectionSet || update.docChanged) {
            const pos = update.state.selection.main.head;
            const line = update.state.doc.lineAt(pos);
            const sel = update.state.selection.main;
            useEditorStore.getState().setCursorPosition(line.number, pos - line.from + 1, Math.abs(sel.to - sel.from));
          }
        }),
        // Yjs collaboration extension — binds ytext to CodeMirror and exposes
        // remote cursors/selections via awareness (only when WS is configured)
        ...(ytext && provider ? [yCollab(ytext, provider.awareness)] : []),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
      if (provider) {
        if (handleStatus) provider.off('status', handleStatus);
        if (handleSync) provider.off('sync', handleSync);
        provider.awareness.destroy();
        provider.disconnect();
      }
      if (ydoc) ydoc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath, projectId]);

  // Listen for 'latex-insert' custom events from toolbar/command palette
  useEffect(() => {
    function handleLatexInsert(e: Event) {
      const view = viewRef.current;
      if (!view) return;

      const detail = (e as CustomEvent).detail;
      const text = typeof detail === 'string' ? detail : detail?.text;
      if (!text) return;

      const { from, to } = view.state.selection.main;
      const selectedText = view.state.sliceDoc(from, to);

      // If the command contains a placeholder like {}, insert selected text inside
      let insertText = text;
      if (selectedText && text.includes('{}')) {
        insertText = text.replace('{}', `{${selectedText}}`);
      }

      view.dispatch({
        changes: { from, to, insert: insertText },
        selection: { anchor: from + insertText.length },
      });
      view.focus();
    }

    window.addEventListener('latex-insert', handleLatexInsert);
    return () => window.removeEventListener('latex-insert', handleLatexInsert);
  }, []);

  // Listen for 'editor-goto-line' events from document outline
  useEffect(() => {
    function handleGotoLine(e: Event) {
      const view = viewRef.current;
      if (!view) return;
      const line = (e as CustomEvent).detail as number;
      if (typeof line !== 'number' || line < 1) return;
      const lineCount = view.state.doc.lines;
      const targetLine = Math.min(line, lineCount);
      const lineInfo = view.state.doc.line(targetLine);
      view.dispatch({
        selection: { anchor: lineInfo.from },
        effects: EditorView.scrollIntoView(lineInfo.from, { y: 'center' }),
      });
      view.focus();
    }

    window.addEventListener('editor-goto-line', handleGotoLine);
    return () => window.removeEventListener('editor-goto-line', handleGotoLine);
  }, []);

  // Reconfigure theme when prop changes without destroying the editor
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: themeCompartment.reconfigure(theme === 'dark' ? oneDark : []),
    });
  }, [theme]);

  // Reconfigure word wrap when store value changes
  const wordWrap = useEditorStore((s) => s.wordWrap);
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: wrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
  }, [wordWrap]);

  return (
    <div
      ref={editorRef}
      className="h-full w-full overflow-hidden"
      aria-label={`LaTeX editor for ${filePath}`}
    />
  );
}
