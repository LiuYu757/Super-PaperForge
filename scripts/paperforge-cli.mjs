#!/usr/bin/env node
// Minimal local PAT client. The server never receives the user's AI prompt;
// only the resulting, explicitly versioned changeset operations are submitted.
import { readFile, open, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const [command, projectId, third, fourth] = process.argv.slice(2);
if (!command || command === '--help' || command === 'help') {
  process.stdout.write(`Usage: PAPERFORGE_URL=https://latex.example.com PAPERFORGE_TOKEN=pfp_... \\
node scripts/paperforge-cli.mjs <command> <projectId> [args]\n\n\
Commands:\n\
  snapshot <projectId>                  Freeze current committed source\n\
  read <projectId> <snapshotId> <fileId> Read frozen text\n\
  propose <projectId> <jsonFile>        Submit changeset JSON\n\
  diff <projectId> <changeSetId>        Inspect proposal\n\
  compile <projectId> [changeSetId]     Compile current source or candidate\n\
  compile-snapshot <projectId> <snapshotId> Compile frozen historical source\n\
  status <projectId> <compilationId>    Read queue status and log\n\
  pdf <projectId> <compileId> <file>    Save PDF to a new file\n\
  cancel <projectId> <compilationId>    Request cancellation\n\
  apply <projectId> <changeSetId>       Apply under base revision CAS\n\
  revert <projectId> <changeSetId>      Create an inverse candidate\n\n\
Set PAPERFORGE_IDEMPOTENCY_KEY to replay a specific write; otherwise a new UUID is printed.\n`);
  process.exit(0);
}

const origin = process.env.PAPERFORGE_URL?.replace(/\/$/, '');
const token = process.env.PAPERFORGE_TOKEN;
if (!origin || !token || !projectId) {
  process.stderr.write('PAPERFORGE_URL, PAPERFORGE_TOKEN and projectId are required.\n');
  process.exit(2);
}
let endpoint;
try { endpoint = new URL(origin); } catch { endpoint = null; }
if (!endpoint || endpoint.username || endpoint.password
  || (endpoint.protocol !== 'https:'
    && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(endpoint.hostname)))) {
  process.stderr.write('PAPERFORGE_URL must use HTTPS (HTTP is allowed only on loopback).\n');
  process.exit(2);
}
const root = `${origin}/api/v1/projects/${encodeURIComponent(projectId)}`;
const timeoutMs = Math.min(Math.max(Number(process.env.PAPERFORGE_TIMEOUT_MS) || 30000, 1000), 120000);
const writeCommands = new Set(['snapshot', 'propose', 'compile', 'compile-snapshot', 'cancel', 'apply', 'revert']);
const key = writeCommands.has(command)
  ? process.env.PAPERFORGE_IDEMPOTENCY_KEY || randomUUID() : null;
if (key) process.stderr.write(`Idempotency-Key: ${key}\n`);

async function call(path, method = 'GET', body) {
  const response = await fetch(`${root}${path}`, { method, redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(key ? { 'Idempotency-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(`Unexpected response type (HTTP ${response.status})`);
  }
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success !== true) {
    const error = new Error(json?.error?.message ?? `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return json.data;
}

try {
  let result;
  switch (command) {
    case 'snapshot': result = await call('/snapshots', 'POST'); break;
    case 'read':
      if (!third || !fourth) throw new Error('read requires snapshotId and fileId');
      result = await call(`/snapshots/${encodeURIComponent(third)}/files/${encodeURIComponent(fourth)}`);
      break;
    case 'propose':
      if (!third) throw new Error('propose requires a JSON file');
      result = await call('/changesets', 'POST', JSON.parse(await readFile(third, 'utf8')));
      break;
    case 'diff':
      if (!third) throw new Error('diff requires changeSetId');
      result = await call(`/changesets/${encodeURIComponent(third)}`);
      break;
    case 'compile':
      result = await call('/compile', 'POST', third ? { changeSetId: third } : {});
      break;
    case 'compile-snapshot':
      if (!third) throw new Error('compile-snapshot requires snapshotId');
      result = await call('/compile', 'POST', { snapshotId: third });
      break;
    case 'status':
      if (!third) throw new Error('status requires compilationId');
      result = await call(`/compile/${encodeURIComponent(third)}/status`);
      break;
    case 'cancel':
      if (!third) throw new Error('cancel requires compilationId');
      result = await call(`/compile/${encodeURIComponent(third)}/cancel`, 'POST');
      break;
    case 'apply':
      if (!third) throw new Error('apply requires changeSetId');
      result = await call(`/changesets/${encodeURIComponent(third)}/apply`, 'POST', {});
      break;
    case 'revert':
      if (!third) throw new Error('revert requires changeSetId');
      result = await call(`/changesets/${encodeURIComponent(third)}/revert`, 'POST');
      break;
    case 'pdf': {
      if (!third || !fourth) throw new Error('pdf requires compilationId and output file');
      const response = await fetch(`${root}/compile/${encodeURIComponent(third)}/pdf`, {
        redirect: 'error', signal: AbortSignal.timeout(Math.max(timeoutMs, 90000)),
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error?.message ?? `HTTP ${response.status}`);
      }
      if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/pdf')) {
        throw new Error('Server did not return a PDF');
      }
      if (Number(response.headers.get('content-length') ?? 0) > 50 * 1024 * 1024) {
        throw new Error('PDF exceeds 50 MiB');
      }
      if (!response.body) throw new Error('PDF response has no body');
      let file;
      let bytes = 0;
      let header = Buffer.alloc(0);
      try {
        file = await open(fourth, 'wx');
        for await (const chunk of response.body) {
          bytes += chunk.byteLength;
          if (bytes > 50 * 1024 * 1024) throw new Error('PDF exceeds 50 MiB');
          if (header.length < 5) header = Buffer.concat([header, chunk]).subarray(0, 5);
          let written = 0;
          while (written < chunk.byteLength) {
            const result = await file.write(chunk, written, chunk.byteLength - written);
            if (result.bytesWritten <= 0) throw new Error('PDF file write failed');
            written += result.bytesWritten;
          }
        }
        if (header.toString() !== '%PDF-') throw new Error('PDF signature is invalid');
      } catch (error) {
        await file?.close();
        if (file) await unlink(fourth).catch(() => {});
        throw error;
      }
      await file.close();
      result = { path: fourth, bytes };
      break;
    }
    default: throw new Error(`Unknown command: ${command}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Request failed'}\n`);
  process.exitCode = error?.status === 409 ? 3 : 1;
}
