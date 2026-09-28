'use client';

/**
 * Typed, structure-validating API client for editor file operations
 * (review N05 / PR-B).
 *
 * Every backend route answers with the standard envelope
 * `{"success":true,"data":…}` (or `{"success":false,"error":{…}}`), but the
 * file tree, the rename flow, downloads and duplicate/create flows used to
 * read the TOP-LEVEL `content`/`sha256` of the whole response object via
 * `as {content:string}` casts — i.e. `undefined`. This module is the single
 * place that unwraps and validates the envelope; components must not cast
 * response shapes ad hoc anymore.
 */

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

/** Unwrap + validate the standard response envelope. Throws on any deviation. */
export async function parseApiEnvelope<T>(
  res: Response,
  validate?: (data: unknown) => boolean,
): Promise<T> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiClientError(
      `Response from ${res.url} was not valid JSON (HTTP ${res.status})`,
      res.status,
      'INVALID_RESPONSE',
    );
  }
  if (!res.ok) {
    const err = (body as { error?: { message?: string; code?: string } })?.error;
    throw new ApiClientError(
      err?.message ?? `Request failed (HTTP ${res.status})`,
      res.status,
      err?.code ?? `HTTP_${res.status}`,
    );
  }
  const envelope = body as { success?: unknown; data?: unknown };
  if (envelope.success !== true || !('data' in envelope)) {
    throw new ApiClientError(
      `Unexpected response structure from ${res.url} (missing success/data envelope)`,
      res.status,
      'INVALID_ENVELOPE',
    );
  }
  if (validate && !validate(envelope.data)) {
    throw new ApiClientError(
      `Response data from ${res.url} failed shape validation`,
      res.status,
      'INVALID_DATA',
    );
  }
  return envelope.data as T;
}

/** Encode each segment of a file path for safe use in fetch URLs. */
export function encodeFilePath(filePath: string): string {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

const SHA256_RE = /^[0-9a-f]{64}$/;

export interface FileText {
  content: string;
  sha256: string;
}

function isFileText(data: unknown): data is FileText {
  const d = data as { content?: unknown; sha256?: unknown };
  return (
    typeof d?.content === 'string' &&
    typeof d?.sha256 === 'string' &&
    SHA256_RE.test(d.sha256)
  );
}

/** GET a text file with its version token, envelope-validated. */
export async function fetchFileText(projectId: string, path: string): Promise<FileText> {
  const res = await fetch(
    `/api/v1/projects/${projectId}/files/${encodeFilePath(path)}`,
    { headers: { Accept: 'application/json' } },
  );
  return parseApiEnvelope(res, isFileText);
}

export interface SaveFileResult {
  id?: string;
  path: string;
  sha256: string;
  revision: string;
}

function isSaveFileResult(data: unknown): data is SaveFileResult {
  const d = data as { sha256?: unknown; revision?: unknown };
  return typeof d?.sha256 === 'string' && typeof d?.revision === 'string';
}

/**
 * Conditional PUT of a text file. `baseSha256` is the strong version token the
 * save is proven against; `null` means create-only (the file must not exist).
 */
export async function putFileText(
  projectId: string,
  path: string,
  opts: { content: string; baseSha256: string | null },
): Promise<SaveFileResult> {
  const res = await fetch(
    `/api/v1/projects/${projectId}/files/${encodeFilePath(path)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: opts.content, baseSha256: opts.baseSha256 }),
    },
  );
  return parseApiEnvelope(res, isSaveFileResult);
}

/** Create a brand-new text file (If-None-Match: * — fails when it exists). */
export async function createFileText(
  projectId: string,
  path: string,
  content: string,
): Promise<SaveFileResult> {
  const res = await fetch(
    `/api/v1/projects/${projectId}/files/${encodeFilePath(path)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-None-Match': '*' },
      body: JSON.stringify({ content }),
    },
  );
  return parseApiEnvelope(res, isSaveFileResult);
}

/**
 * Delete a file. `expectedSha256` (when given) makes the delete conditional —
 * it fails instead of removing a file that changed since it was read.
 */
export async function deleteFileApi(
  projectId: string,
  path: string,
  opts?: { expectedSha256?: string },
): Promise<void> {
  const headers: Record<string, string> = {};
  if (opts?.expectedSha256) headers['If-Match'] = `"${opts.expectedSha256}"`;
  const res = await fetch(
    `/api/v1/projects/${projectId}/files/${encodeFilePath(path)}`,
    { method: 'DELETE', headers },
  );
  await parseApiEnvelope(res, () => true);
}

export type RenameKind = 'file' | 'prefix';

/** Atomic server-side rename (file or folder prefix). All-or-nothing. */
export async function renamePath(
  projectId: string,
  opts: { kind: RenameKind; from: string; to: string; expectedSha256?: string },
): Promise<{ kind: RenameKind; from: string; to: string; revision: string }> {
  const res = await fetch(`/api/v1/projects/${projectId}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  const data = await parseApiEnvelope<{ kind: RenameKind; from: string; to: string; revision: string }>(
    res,
    (d) => {
      const v = d as { kind?: unknown; from?: unknown; to?: unknown; revision?: unknown };
      return (
        (v.kind === 'file' || v.kind === 'prefix') &&
        typeof v.from === 'string' &&
        typeof v.to === 'string' &&
        typeof v.revision === 'string'
      );
    },
  );
  return data;
}

/**
 * Fetch a file as a downloadable Blob. Text files come from the JSON
 * envelope (validated); binary files are fetched as raw bytes.
 */
export async function downloadFileBlob(
  projectId: string,
  path: string,
  isBinary: boolean,
): Promise<Blob> {
  if (!isBinary) {
    const { content } = await fetchFileText(projectId, path);
    return new Blob([content], { type: 'text/plain' });
  }
  // Binary files must be transferred as bytes — a JSON round-trip would
  // re-encode them through UTF-8 and corrupt the file.
  const res = await fetch(
    `/api/v1/projects/${projectId}/files/${encodeFilePath(path)}?raw=1`,
  );
  if (!res.ok) {
    throw new ApiClientError(`Download failed (HTTP ${res.status})`, res.status, 'DOWNLOAD_FAILED');
  }
  return res.blob();
}

/** Trigger the browser's "save file" dialog for a blob. */
export function saveBlobAs(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
