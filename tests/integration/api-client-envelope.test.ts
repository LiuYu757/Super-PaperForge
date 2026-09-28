/**
 * PR-B typed API client (review N05): every file entry point must parse the
 * standard `{success, data}` envelope — or throw. Reading `content` off the
 * top-level response object produced `undefined` bodies and null baselines
 * in the file tree; these cases pin the contract.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiClientError,
  fetchFileText,
  putFileText,
  createFileText,
  deleteFileApi,
  renamePath,
  parseApiEnvelope,
} from '@/lib/api-client';

const SHA = 'a'.repeat(64);
const NEXT_SHA = 'b'.repeat(64);

function stubJson(status: number, body: unknown) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('parseApiEnvelope', () => {
  it('unwraps {success:true, data} and returns the inner payload', async () => {
    vi.stubGlobal('fetch', stubJson(200, { success: true, data: { content: 'hi', sha256: SHA } }));
    const res = await fetch('/x');
    const data = await parseApiEnvelope<{ content: string }>(res, (d) =>
      typeof (d as { content?: string })?.content === 'string');
    expect(data.content).toBe('hi');
  });

  it('throws on a non-ok status with the server error message', async () => {
    vi.stubGlobal('fetch', stubJson(412, { success: false, error: { code: 'PRECONDITION_FAILED', message: 'changed' } }));
    const res = await fetch('/x');
    await expect(parseApiEnvelope(res)).rejects.toMatchObject({
      status: 412,
      code: 'PRECONDITION_FAILED',
      message: 'changed',
    });
  });

  it('fetchFileText reads the NESTED data.content (the old top-level bug)', async () => {
    // The file tree used to read `data.content` from the whole response
    // object; the content actually lives under `data`. This pins the fix.
    vi.stubGlobal('fetch', stubJson(200, { success: true, data: { content: 'real body', sha256: SHA } }));
    const data = await fetchFileText('p', 'f');
    expect(data.content).toBe('real body');
    expect(data.sha256).toBe(SHA);
  });

  it('throws when success is not true (raw payload without envelope)', async () => {
    vi.stubGlobal('fetch', stubJson(200, { content: 'not an envelope', sha256: SHA }));
    const res = await fetch('/x');
    await expect(parseApiEnvelope(res)).rejects.toMatchObject({ code: 'INVALID_ENVELOPE' });
  });

  it('rejects data that fails shape validation instead of returning undefined fields', async () => {
    vi.stubGlobal('fetch', stubJson(200, { success: true, data: { content: 'hi' } })); // sha256 missing
    await expect(fetchFileText('p', 'f')).rejects.toBeInstanceOf(ApiClientError);
  });
});

describe('fetchFileText', () => {
  it('returns content + version token', async () => {
    vi.stubGlobal('fetch', stubJson(200, { success: true, data: { content: 'body', sha256: SHA } }));
    await expect(fetchFileText('p', 'a/b c.tex')).resolves.toEqual({ content: 'body', sha256: SHA });
    // Path segments are encoded individually, slashes preserved.
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/v1/projects/p/files/a/b%20c.tex');
  });
});

describe('putFileText', () => {
  it('sends {content, baseSha256} as a conditional PUT', async () => {
    const mock = stubJson(200, { success: true, data: { sha256: NEXT_SHA, revision: '3' } });
    vi.stubGlobal('fetch', mock);
    await putFileText('p', 'f.tex', { content: 'new', baseSha256: SHA });
    const [url, init] = mock.mock.calls[0]!;
    expect(url).toBe('/api/v1/projects/p/files/f.tex');
    expect(init?.method).toBe('PUT');
    expect(JSON.parse(init?.body as string)).toEqual({ content: 'new', baseSha256: SHA });
  });
});

describe('createFileText', () => {
  it('uses If-None-Match: * (create-only) and validates the response', async () => {
    const mock = stubJson(200, { success: true, data: { sha256: NEXT_SHA, revision: '1' } });
    vi.stubGlobal('fetch', mock);
    await createFileText('p', 'new.tex', '');
    const init = mock.mock.calls[0]?.[1];
    expect(init?.headers).toMatchObject({ 'If-None-Match': '*' });
  });

  it('throws when the file already exists (server 412)', async () => {
    vi.stubGlobal('fetch', stubJson(412, { success: false, error: { code: 'PRECONDITION_FAILED', message: 'exists' } }));
    await expect(createFileText('p', 'new.tex', '')).rejects.toMatchObject({ status: 412 });
  });
});

describe('deleteFileApi', () => {
  it('sends If-Match with the expected hash when provided', async () => {
    const mock = stubJson(200, { success: true, data: { message: 'Deleted' } });
    vi.stubGlobal('fetch', mock);
    await deleteFileApi('p', 'f.tex', { expectedSha256: SHA });
    const init = mock.mock.calls[0]?.[1];
    expect(init?.method).toBe('DELETE');
    expect(init?.headers).toMatchObject({ 'If-Match': `"${SHA}"` });
  });
});

describe('renamePath', () => {
  it('POSTs the atomic rename and validates the envelope', async () => {
    const mock = stubJson(200, { success: true, data: { kind: 'file', from: 'a.tex', to: 'b.tex', revision: '2' } });
    vi.stubGlobal('fetch', mock);
    await renamePath('p', { kind: 'file', from: 'a.tex', to: 'b.tex' });
    const [url, init] = mock.mock.calls[0]!;
    expect(url).toBe('/api/v1/projects/p/rename');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ kind: 'file', from: 'a.tex', to: 'b.tex' });
  });

  it('surfaces TARGET_EXISTS as an error the UI can explain (rename left the original intact)', async () => {
    vi.stubGlobal('fetch', stubJson(409, { success: false, error: { code: 'TARGET_EXISTS', message: 'A file already exists at the destination path' } }));
    await expect(renamePath('p', { kind: 'file', from: 'a.tex', to: 'b.tex' })).rejects.toMatchObject({
      status: 409,
      code: 'TARGET_EXISTS',
    });
  });
});
