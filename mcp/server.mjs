#!/usr/bin/env node
// MCP server exposing the Super-PaperForge external API to local AI clients.
//
// The server never sees a prompt and never calls a model. It only forwards the
// snapshot / changeset / compile calls described in docs/selfhost/EXTERNAL-API.md,
// so every write lands through the same validated, revision-checked path a
// human edit would take.
//
// Configuration (environment):
//   PAPERFORGE_URL        Base URL of the instance, e.g. https://latex.example.com
//                         (HTTPS required; HTTP is allowed only on loopback)
//   PAPERFORGE_TOKEN      Personal access token, pfp_...
//   PAPERFORGE_PROJECT_ID Optional default project; tools also accept a
//                         projectId argument per call
//   PAPERFORGE_TIMEOUT_MS Request timeout, 1000–120000 (default 30000)
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { open, unlink } from 'node:fs/promises';

const origin = process.env.PAPERFORGE_URL?.replace(/\/$/, '');
const token = process.env.PAPERFORGE_TOKEN;
const defaultProjectId = process.env.PAPERFORGE_PROJECT_ID;
const timeoutMs = Math.min(
  Math.max(Number(process.env.PAPERFORGE_TIMEOUT_MS) || 30000, 1000),
  120000,
);

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

if (!origin || !token) {
  fail('PAPERFORGE_URL and PAPERFORGE_TOKEN are required.');
}
let endpoint;
try {
  endpoint = new URL(origin);
} catch {
  endpoint = null;
}
if (
  !endpoint ||
  endpoint.username ||
  endpoint.password ||
  (endpoint.protocol !== 'https:' &&
    !(
      endpoint.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '::1', '[::1]'].includes(endpoint.hostname)
    ))
) {
  fail('PAPERFORGE_URL must use HTTPS (HTTP is allowed only on loopback).');
}

const MAX_PDF_BYTES = 50 * 1024 * 1024;

function projectIdOrDefault(value) {
  const id = value ?? defaultProjectId;
  if (!id) {
    throw new Error(
      'projectId is required (or set PAPERFORGE_PROJECT_ID as a default).',
    );
  }
  return id;
}

async function call(projectId, path, { method = 'GET', body } = {}) {
  const key = method === 'GET' ? null : randomUUID();
  const response = await fetch(
    `${origin}/api/v1/projects/${encodeURIComponent(projectId)}${path}`,
    {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(key ? { 'Idempotency-Key': key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
  );
  const contentType = response.headers.get('content-type') ?? '';
  const json = contentType.toLowerCase().includes('application/json')
    ? await response.json().catch(() => null)
    : null;
  if (!response.ok || json?.success !== true) {
    const err = new Error(
      json?.error?.message ??
        `HTTP ${response.status} ${response.statusText}`.trim(),
    );
    err.status = response.status;
    err.code = json?.error?.code;
    throw err;
  }
  return json.data;
}

const projectArg = {
  projectId: z
    .string()
    .optional()
    .describe(
      'Project ID. Optional when PAPERFORGE_PROJECT_ID is set on the server.',
    ),
};

const editOperation = z
  .object({
    op: z
      .enum(['edit_text', 'replace_file', 'create_file', 'delete_file'])
      .describe(
        'edit_text: exact oldText→newText replacements in a file. ' +
          'replace_file: rewrite a whole file. create_file: add a new path. ' +
          'delete_file: remove a file.',
      ),
    fileId: z
      .string()
      .optional()
      .describe('Required for edit_text, replace_file and delete_file.'),
    expectedSha256: z
      .string()
      .optional()
      .describe(
        'SHA-256 of the file contents in the base snapshot. Required for ' +
          'edit_text, replace_file and delete_file; copy it from the snapshot ' +
          'manifest.',
      ),
    path: z
      .string()
      .optional()
      .describe('Required for create_file: project-relative path.'),
    content: z
      .string()
      .optional()
      .describe('Required for create_file and replace_file.'),
    edits: z
      .array(
        z.object({
          oldText: z
            .string()
            .min(1)
            .describe('Exact text to find. No fuzzy matching.'),
          newText: z.string().describe('Replacement text.'),
          expectedOccurrences: z
            .number()
            .int()
            .positive()
            .optional()
            .describe(
              'Declare when oldText legitimately occurs more than once; ' +
                'otherwise an ambiguous match is rejected.',
            ),
        }),
      )
      .min(1)
      .optional()
      .describe('Required for edit_text.'),
  })
  .describe('One changeset operation.');

const server = new McpServer({
  name: 'super-paperforge',
  version: '1.0.0',
});

function json(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function toolErr(error) {
  const status = error?.status ? `HTTP ${error.status} ` : '';
  const code = error?.code ? ` [${error.code}]` : '';
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `${status}${error instanceof Error ? error.message : 'Request failed'}${code}`,
      },
    ],
  };
}

server.registerTool(
  'paperforge_snapshot',
  {
    title: 'Snapshot project source',
    description:
      'Freeze the committed project source and return the snapshot ID, base ' +
      'revision and every file with its sha256. This is always the first step ' +
      'of an edit loop: file contents and hashes from this snapshot are what ' +
      'changeset operations are checked against.',
    inputSchema: projectArg,
  },
  async ({ projectId }) => {
    try {
      return json(await call(projectIdOrDefault(projectId), '/snapshots', { method: 'POST' }));
    } catch (e) {
      return toolErr(e);
    }
  },
);

server.registerTool(
  'paperforge_read_file',
  {
    title: 'Read file at snapshot',
    description:
      'Read one file exactly as it stood in a snapshot. Returns the text and ' +
      'its sha256 (echo it back as expectedSha256 when building a changeset).',
    inputSchema: {
      ...projectArg,
      snapshotId: z.string(),
      fileId: z.string(),
    },
  },
  async ({ projectId, snapshotId, fileId }) => {
    try {
      return json(
        await call(
          projectIdOrDefault(projectId),
          `/snapshots/${encodeURIComponent(snapshotId)}/files/${encodeURIComponent(fileId)}`,
        ),
      );
    } catch (e) {
      return toolErr(e);
    }
  },
);

server.registerTool(
  'paperforge_propose_changeset',
  {
    title: 'Propose a changeset',
    description:
      'Submit a candidate changeset against a snapshot. Nothing is written to ' +
      'the live document: the result can be inspected, compiled, then applied ' +
      'or discarded. All edits are exact-match and all-or-nothing; a 409 ' +
      'means the safety check fired (EDIT_NOT_FOUND / EDIT_AMBIGUOUS / hash ' +
      'mismatch) — re-read the file and rebuild.',
    inputSchema: {
      ...projectArg,
      baseSnapshotId: z
        .string()
        .describe('Snapshot the operations were built against.'),
      message: z
        .string()
        .optional()
        .describe('Human-readable summary of the proposed change.'),
      operations: z.array(editOperation).min(1).max(1000),
    },
  },
  async ({ projectId, baseSnapshotId, message, operations }) => {
    try {
      return json(
        await call(projectIdOrDefault(projectId), '/changesets', {
          method: 'POST',
          body: { baseSnapshotId, ...(message ? { message } : {}), operations },
        }),
      );
    } catch (e) {
      return toolErr(e);
    }
  },
);

server.registerTool(
  'paperforge_get_changeset',
  {
    title: 'Inspect a changeset',
    description:
      'Read a changeset: status, unified diff, the base revision it targets ' +
      'and whether it has been applied or reverted.',
    inputSchema: { ...projectArg, changeSetId: z.string() },
  },
  async ({ projectId, changeSetId }) => {
    try {
      return json(
        await call(
          projectIdOrDefault(projectId),
          `/changesets/${encodeURIComponent(changeSetId)}`,
        ),
      );
    } catch (e) {
      return toolErr(e);
    }
  },
);

server.registerTool(
  'paperforge_compile',
  {
    title: 'Trigger a compile',
    description:
      'Queue a LaTeX compile. With no body it compiles the committed source; ' +
      'with changeSetId it compiles the frozen candidate; with snapshotId a ' +
      'frozen historical source. Returns an acceptance receipt — poll ' +
      'paperforge_compilation_status for the result.',
    inputSchema: {
      ...projectArg,
      changeSetId: z
        .string()
        .optional()
        .describe('Compile this changeset candidate.'),
      snapshotId: z
        .string()
        .optional()
        .describe('Compile this frozen snapshot (mutually exclusive with changeSetId).'),
    },
  },
  async ({ projectId, changeSetId, snapshotId }) => {
    if (changeSetId && snapshotId) {
      return toolErr(
        new Error('Choose either changeSetId or snapshotId, not both.'),
      );
    }
    try {
      return json(
        await call(projectIdOrDefault(projectId), '/compile', {
          method: 'POST',
          body: changeSetId
            ? { changeSetId }
            : snapshotId
              ? { snapshotId }
              : {},
        }),
      );
    } catch (e) {
      return toolErr(e);
    }
  },
);

server.registerTool(
  'paperforge_compilation_status',
  {
    title: 'Compilation status and log',
    description:
      'Poll a compilation: queue position, success/failure, LaTeX log excerpt ' +
      'and artifact metadata.',
    inputSchema: { ...projectArg, compileId: z.string() },
  },
  async ({ projectId, compileId }) => {
    try {
      return json(
        await call(
          projectIdOrDefault(projectId),
          `/compile/${encodeURIComponent(compileId)}/status`,
        ),
      );
    } catch (e) {
      return toolErr(e);
    }
  },
);

server.registerTool(
  'paperforge_cancel_compilation',
  {
    title: 'Cancel a compilation',
    description:
      'Request cancellation of a queued or running compile. A finished job ' +
      'cannot be retroactively cancelled.',
    inputSchema: { ...projectArg, compileId: z.string() },
  },
  async ({ projectId, compileId }) => {
    try {
      return json(
        await call(
          projectIdOrDefault(projectId),
          `/compile/${encodeURIComponent(compileId)}/cancel`,
          { method: 'POST' },
        ),
      );
    } catch (e) {
      return toolErr(e);
    }
  },
);

server.registerTool(
  'paperforge_download_pdf',
  {
    title: 'Download compiled PDF',
    description:
      'Save the PDF of a finished compilation to a local file. Fails if the ' +
      'output path already exists (no overwrite) or the artifact exceeds 50 MiB.',
    inputSchema: {
      ...projectArg,
      compileId: z.string(),
      outputPath: z
        .string()
        .describe('Local file path to write; must not exist yet.'),
    },
  },
  async ({ projectId, compileId, outputPath }) => {
    let file;
    try {
      const response = await fetch(
        `${origin}/api/v1/projects/${encodeURIComponent(projectIdOrDefault(projectId))}` +
          `/compile/${encodeURIComponent(compileId)}/pdf`,
        {
          redirect: 'error',
          signal: AbortSignal.timeout(Math.max(timeoutMs, 90000)),
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) {
        const err = await response.json().catch(() => null);
        throw new Error(err?.error?.message ?? `HTTP ${response.status}`);
      }
      if (
        !(response.headers.get('content-type') ?? '')
          .toLowerCase()
          .includes('application/pdf')
      ) {
        throw new Error('Server did not return a PDF');
      }
      if (!response.body) throw new Error('PDF response has no body');
      let bytes = 0;
      let header = Buffer.alloc(0);
      file = await open(outputPath, 'wx');
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > MAX_PDF_BYTES) throw new Error('PDF exceeds 50 MiB');
        if (header.length < 5) {
          header = Buffer.concat([header, chunk]).subarray(0, 5);
        }
        await file.write(chunk);
      }
      if (header.toString() !== '%PDF-') {
        throw new Error('PDF signature is invalid');
      }
      await file.close();
      return json({ path: outputPath, bytes });
    } catch (e) {
      await file?.close();
      if (file) await unlink(outputPath).catch(() => {});
      return toolErr(e);
    }
  },
);

server.registerTool(
  'paperforge_apply_changeset',
  {
    title: 'Apply a changeset',
    description:
      'Land a proposed changeset on the live document under a compare-and-set ' +
      'on the project revision. Returns 409 REVISION_CONFLICT when the project ' +
      'moved since the base snapshot — re-snapshot and rebuild instead of ' +
      'retrying. Requires the changeset:apply scope and the server-side ' +
      'ENABLE_EXTERNAL_APPLY=true gate.',
    inputSchema: {
      ...projectArg,
      changeSetId: z.string(),
      baseRevision: z
        .string()
        .optional()
        .describe('Optional extra guard: expected base revision.'),
    },
  },
  async ({ projectId, changeSetId, baseRevision }) => {
    try {
      return json(
        await call(
          projectIdOrDefault(projectId),
          `/changesets/${encodeURIComponent(changeSetId)}/apply`,
          {
            method: 'POST',
            body: baseRevision ? { baseRevision } : {},
          },
        ),
      );
    } catch (e) {
      return toolErr(e);
    }
  },
);

server.registerTool(
  'paperforge_revert_changeset',
  {
    title: 'Revert a changeset',
    description:
      'Build the inverse of an applied changeset as a new candidate, which ' +
      'then goes through the normal inspect → compile → apply flow. Fails with ' +
      '409 REVERT_CONFLICT if the touched files were edited since.',
    inputSchema: { ...projectArg, changeSetId: z.string() },
  },
  async ({ projectId, changeSetId }) => {
    try {
      return json(
        await call(
          projectIdOrDefault(projectId),
          `/changesets/${encodeURIComponent(changeSetId)}/revert`,
          { method: 'POST' },
        ),
      );
    } catch (e) {
      return toolErr(e);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
