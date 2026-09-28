/**
 * PR-B frontend contract: the editor never issues an unconditional PUT, and a
 * conflict is a TERMINAL state for auto-upload (review N07).
 *
 * Exercise the REAL zustand store + the REAL save module (fetch stubbed), so
 * the protocol that reaches the network is the one the editor actually uses:
 *   1. opening a file keeps the server hash as the tab baseline
 *   2. a save sends `{ content, baseSha256 }` — never a bare PUT
 *   3. a 412/428/409 keeps the local edit dirty, keeps the ORIGINAL baseline
 *      (no silent rebase!) and moves the tab to status 'conflict'; auto-save
 *      refuses to re-submit it until the user resolves explicitly
 *   4. a committed save rebinds the baseline and binds savedSeq to editSeq
 *      (an in-flight keystroke after the request is sent stays "unsaved")
 *   5. one in-flight save per file: a second call while the first is pending
 *      returns the SAME promise instead of issuing a second PUT (N12)
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/store/editor-store';
import { saveTabVersioned, __resetInflightSaves } from '@/lib/editor-save';
const PROJECT = 'proj-acceptance';
const PATH = 'main.tex';
const BASELINE = 'a'.repeat(64);
const NEXT_BASELINE = 'b'.repeat(64);
function resetStore() {
  useEditorStore.setState({
    tabs: [],
    activeTab: null,
    compilationLog: '',
    compilationStatus: 'idle',
    compilationDuration: null,
    latestPdfUrl: null,
    autoCompileEnabled: true,
    autoSaveEnabled: true,
    sidebarCollapsed: false,
    logPanelCollapsed: false,
    fontSize: 14,
    lineHeight: 1.6,
    fontFamily: 'var(--font-mono, monospace)',
    wordWrap: true,
    showLineNumbers: true,
    cursorLine: 1,
    cursorCol: 1,
    selectionLength: 0,
  });
}
/**
 * Stub fetch. PUT requests record the request; a follow-up GET returns the
 * current server state (the conflict handler reads it for the banner).
 */
function stubFetch(status: number, body: unknown, remoteBody?: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      if (String(init?.method ?? 'GET').toUpperCase() === 'GET') {
        return new Response(
          JSON.stringify({ success: true, data: remoteBody ?? { content: 'server', sha256: NEXT_BASELINE } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
  return calls;
}
beforeEach(() => {
  resetStore();
  __resetInflightSaves();
  vi.unstubAllGlobals();
});
afterEach(() => {
  __resetInflightSaves();
  vi.unstubAllGlobals();
});
describe('versioned save protocol (R01 + N07/N12)', () => {
  it('openFile without a baseline stays create-only (baseSha256 null)', () => {
    useEditorStore.getState().openFile(PATH, 'draft', null);
    const tab = useEditorStore.getState().tabs.find((t) => t.path === PATH)!;
    expect(tab.baseSha256).toBeNull();
    expect(tab.dirty).toBe(false);
  });
  it('save sends content WITH the baseline — a bare PUT never happens', async () => {
    useEditorStore.getState().openFile(PATH, 'v1', BASELINE);
    useEditorStore.getState().updateContent(PATH, 'v2');
    const calls = stubFetch(200, { success: true, data: { sha256: NEXT_BASELINE, revision: '7' } });
    const outcome = await saveTabVersioned(PROJECT, PATH);
    expect(outcome).toBe('saved');
    expect(calls).toHaveLength(1);
    const [url, init] = [calls[0].url, calls[0].init];
    expect(url).toBe(`/api/v1/projects/${PROJECT}/files/${PATH}`);
    expect(init.method).toBe('PUT');
    const sent = JSON.parse(init.body as string) as { content: string; baseSha256: string | null };
    expect(sent.content).toBe('v2');
    expect(sent.baseSha256).toBe(BASELINE); // the baseline the tab was based on
    const tab = useEditorStore.getState().tabs.find((t) => t.path === PATH)!;
    expect(tab.dirty).toBe(false);
    expect(tab.status).toBe('clean');
    expect(tab.baseSha256).toBe(NEXT_BASELINE);
    expect(tab.lastKnownRevision).toBe('7');
    expect(tab.savedSeq).toBe(tab.editSeq);
  });
  it('a save of an unsaved tab carries baseSha256: null (create-only path)', async () => {
    useEditorStore.getState().openFile(PATH, 'brand new', null);
    const calls = stubFetch(200, { success: true, data: { sha256: NEXT_BASELINE, revision: '1' } });
    await saveTabVersioned(PROJECT, PATH);
    const sent = JSON.parse(calls[0].init.body as string) as { content: string; baseSha256: string | null };
    expect(sent.baseSha256).toBeNull();
  });
  it('412 keeps the local edit dirty, keeps the ORIGINAL baseline, and enters status conflict (N07)', async () => {
    useEditorStore.getState().openFile(PATH, 'v1', BASELINE);
    useEditorStore.getState().updateContent(PATH, 'my newer edit');
    const calls = stubFetch(
      412,
      { success: false, error: { code: 'PRECONDITION_FAILED', message: 'changed' } },
      { content: 'server body', sha256: NEXT_BASELINE },
    );
    const outcome = await saveTabVersioned(PROJECT, PATH);
    expect(outcome).toBe('conflict');
    const tab = useEditorStore.getState().tabs.find((t) => t.path === PATH)!;
    expect(tab.dirty).toBe(true); // never silently dropped
    expect(tab.content).toBe('my newer edit');
    // THE critical N07 assertion: the client does NOT adopt the server hash.
    // Swapping it without a review would let stale bytes pass the next check.
    expect(tab.baseSha256).toBe(BASELINE);
    expect(tab.status).toBe('conflict');
    expect(tab.remote?.sha256).toBe(NEXT_BASELINE);
    expect(tab.remote?.content).toBe('server body');
    // A second save attempt while conflicted must not issue another PUT.
    const callsBefore = calls.length;
    await saveTabVersioned(PROJECT, PATH);
    expect(calls.length).toBe(callsBefore);
  });
  it('explicit resolution: keep-my-version rebases onto the REVIEWED server hash and saves', async () => {
    useEditorStore.getState().openFile(PATH, 'v1', BASELINE);
    useEditorStore.getState().updateContent(PATH, 'my newer edit');
    stubFetch(
      412,
      { success: false, error: { code: 'PRECONDITION_FAILED' } },
      { content: 'server body', sha256: NEXT_BASELINE },
    );
    await saveTabVersioned(PROJECT, PATH);
    const tab = useEditorStore.getState().tabs.find((t) => t.path === PATH)!;
    expect(tab.status).toBe('conflict');
    // The user reviewed the server version and chose to overwrite it.
    useEditorStore.getState().authorizeInformedOverwrite(PATH, NEXT_BASELINE);
    const after = useEditorStore.getState().tabs.find((t) => t.path === PATH)!;
    expect(after.status).toBe('dirty');
    expect(after.baseSha256).toBe(NEXT_BASELINE); // explicit, user-driven rebase
    expect(after.content).toBe('my newer edit');  // the local body survives
  });
  it('a keystroke landing while save is in flight is never marked committed', async () => {
    useEditorStore.getState().openFile(PATH, 'v1', BASELINE);
    useEditorStore.getState().updateContent(PATH, 'part one');
    // Defer the response; type "part two" while the save is pending.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal('fetch', vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify({ success: true, data: { sha256: NEXT_BASELINE, revision: '9' } }), { status: 200 });
    }));
    const pending = saveTabVersioned(PROJECT, PATH);
    useEditorStore.getState().updateContent(PATH, 'part one part two');
    release();
    await pending;
    const tab = useEditorStore.getState().tabs.find((t) => t.path === PATH)!;
    // The commit bound to the sequence that was sent; the later keystroke
    // advanced editSeq past savedSeq, so the tab remains dirty/unsaved.
    expect(tab.savedSeq).toBeLessThan(tab.editSeq);
    expect(tab.dirty).toBe(true);
    expect(tab.content).toBe('part one part two');
  });
  it('single-flight: a second save call while one is pending reuses the SAME promise (N12)', async () => {
    useEditorStore.getState().openFile(PATH, 'v1', BASELINE);
    useEditorStore.getState().updateContent(PATH, 'part one');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify({ success: true, data: { sha256: NEXT_BASELINE, revision: '9' } }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const first = saveTabVersioned(PROJECT, PATH);
    const second = saveTabVersioned(PROJECT, PATH);
    release();
    const [o1, o2] = await Promise.all([first, second]);
    expect(o1).toBe('saved');
    expect(o2).toBe('saved');
    // Exactly one PUT reached the network for the file.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('markSaved binds savedSeq to the committed editSeq', () => {
    useEditorStore.getState().openFile(PATH, 'v1', BASELINE);
    useEditorStore.getState().updateContent(PATH, 'a');
    useEditorStore.getState().updateContent(PATH, 'ab');
    expect(useEditorStore.getState().tabs.find((t) => t.path === PATH)!.editSeq).toBe(2);
    useEditorStore.getState().markSaved(PATH, NEXT_BASELINE, '3');
    const tab = useEditorStore.getState().tabs.find((t) => t.path === PATH)!;
    expect(tab.savedSeq).toBe(2);
    expect(tab.dirty).toBe(false);
    expect(tab.baseSha256).toBe(NEXT_BASELINE);
  });
});
