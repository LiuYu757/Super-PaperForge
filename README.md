<div align="center">

# Super-PaperForge

**A self-hosted, collaborative LaTeX editor — with a versioned external API and a bundled MCP server, so a local AI can safely read and edit your papers.**

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[Report Bug](https://github.com/LiuYu757/Super-PaperForge/issues) · [Request Feature](https://github.com/LiuYu757/Super-PaperForge/issues)

</div>

---

## What is this?

Super-PaperForge is an open-source (MIT) Overleaf-style LaTeX collaboration
platform you run yourself: browser editor, real-time collaboration, Git-backed
version history, a containerized TeX compile pipeline — and a first-class
**external API for AI tools**.

The AI story is deliberately split in two:

- **Server-side assistant** (optional): an in-editor AI panel powered by your
  own `ANTHROPIC_API_KEY`, for quick write/fix/explain help.
- **Local AI via MCP** (the interesting part): any MCP-capable agent on your
  machine — Claude Desktop, Cursor, Devin, a custom script — can snapshot a
  paper, propose edits, compile the candidate, and apply it, all through a
  versioned changeset protocol with compare-and-set conflict protection. The
  server never calls a model and never sees your prompts.

| | Overleaf Free | Overleaf Pro | **Super-PaperForge** |
|---|:---:|:---:|:---:|
| Real-time collaboration | 1 collaborator | Unlimited | **Unlimited** |
| Version history | 24 h | Full | **Full (Git-based)** |
| Git push/pull | – | Push only | **Full push/pull** |
| DOCX export | – | – | **Yes (Pandoc)** |
| Auto-compile | – | Yes | **Yes** |
| AI edit API + MCP server | – | – | **Yes** |
| Self-hostable | – | – | **Yes** |
| Cost | Free | $199/yr | **Free (self-hosted)** |

## Features

- **LaTeX editor** — CodeMirror 6 with LaTeX/BibTeX highlighting, 160+
  completions, snippets, linting, bracket matching, regex search.
- **Instant PDF preview** — PDF.js split view, SyncTeX-style
  click-to-source-jump, zoom, one-click download.
- **Real-time collaboration** — Yjs presence and multi-cursor awareness.
  Editing defaults to a *versioned* protocol: every save carries the SHA-256
  of the version it was based on, and a stale write gets `409/412` instead of
  silently overwriting someone. `EDITOR_SYNC_MODE=yjs` restores the legacy
  CRDT channel.
- **Version history** — every project is a real Git repository: named
  versions, side-by-side diffs, one-click restore.
- **Git integration** — link GitHub/GitLab/Bitbucket remotes, push/pull,
  SSH key management, AES-256-GCM encrypted credential storage.
- **Compile pipeline** — BullMQ workers run TeX Live inside Docker: no
  network, no shell escape, per-attempt logs, SyncTeX, cancellable jobs.
- **Template gallery** — IEEE, ACM, Springer, Beamer, thesis, CV; one-click
  project creation, user-submitted templates with admin moderation.
- **External AI API + MCP server** — snapshot → changeset → compile → apply
  (see below and [`docs/selfhost/EXTERNAL-API.md`](docs/selfhost/EXTERNAL-API.md)).
- **SaaS or selfhost mode** — `PAPERFORGE_MODE=selfhost` disables billing,
  public signup and remote compile in one switch; `saas` enables the hosted
  feature set (plans, checkout, admin analytics).

## Architecture

```
                  ┌──────────────────┐
                  │      nginx       │  (TLS termination, WS proxy, CORS)
                  └───┬────┬─────┬───┘
              ┌───────┘    │     └────────┐
              ▼            ▼              ▼
     ┌─────────────┐ ┌───────────┐ ┌────────────────┐
     │  Next.js 15 │ │ WebSocket │ │ Compile worker │
     │ app + REST  │ │  (Yjs)    │ │ BullMQ + TeX   │
     │     API     │ │           │ │ Live in Docker │
     └──────┬──────┘ └─────┬─────┘ └───────┬────────┘
            │              │               │
            ▼              ▼               ▼
     ┌────────────┐  ┌──────────┐   ┌────────────┐
     │ PostgreSQL │  │  Redis 7 │   │   MinIO    │
     │ + Prisma 7 │  │  queue + │   │ S3 object  │
     │            │  │ Yjs sync │   │  storage   │
     └────────────┘  └──────────┘   └────────────┘
```

## Tech Stack

| Layer | Technology |
|:---|:---|
| App | Next.js 15 (App Router), React 18, TypeScript, Tailwind + shadcn/ui |
| Editor | CodeMirror 6, PDF.js, KaTeX |
| Collaboration | Yjs + standalone WebSocket service |
| Data | PostgreSQL 16 + Prisma 7, Redis 7 + BullMQ, MinIO (S3-compatible) |
| Compile | TeX Live + latexmk in Docker, Pandoc for DOCX |
| Auth | Auth.js v5 (credentials + Google/GitHub OAuth), bcrypt |
| AI | Optional Anthropic in-app assistant; external API + `mcp/` server for local agents |

## Quick Start

Prerequisites: Node.js 20+, Docker + Docker Compose.

```bash
git clone https://github.com/LiuYu757/Super-PaperForge.git
cd Super-PaperForge
cp .env.example .env
```

Set the required secrets in `.env` (compose refuses to start without them):

```bash
POSTGRES_PASSWORD=...        # any strong value
MINIO_ROOT_USER=...          # e.g. paperforge
MINIO_ROOT_PASSWORD=...      # any strong value
NEXTAUTH_SECRET=...          # openssl rand -hex 32
ENCRYPTION_KEY=...           # openssl rand -hex 32  (64 hex chars)
```

Then start the whole stack — app, worker, websocket, Postgres, Redis, MinIO,
nginx — in one command:

```bash
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
```

Open **http://localhost** (nginx) or the app directly at
**http://localhost:3000** and register your account. To grant yourself the
admin panel (`role` column on `users`):

```bash
docker compose exec postgres psql -U paperforge \
  -c "UPDATE users SET role='admin' WHERE email='you@example.com';"
```

For app-only development against the containerized infrastructure:

```bash
docker compose up -d postgres redis minio mailhog   # infra only
npm install
npx prisma migrate dev
npm run db:seed                                     # optional: template gallery
npm run dev                                         # http://localhost:3000
```

## Connect a local AI via MCP

This is the part most LaTeX tools don't have. Super-PaperForge exposes a
**versioned external API** designed for automation, and ships a reference
[MCP](https://modelcontextprotocol.io/) server in [`mcp/`](mcp/) that turns it
into tools any MCP client can call.

The design constraint: an AI edits through the *same validated write path* a
human does. It cannot bypass review, cannot fuzzy-match edits, and cannot
overwrite a paragraph someone else just wrote — a stale proposal gets
`409 REVISION_CONFLICT`, not a silent merge.

### 1. Enable external apply (optional but recommended)

Candidate changesets and compiles work out of the box. Landing an edit on the
live document additionally requires the server-side gate:

```bash
# .env
ENABLE_EXTERNAL_APPLY=true
```

Leave it `false` if you want the AI to *propose* changes that a human applies
from the UI.

### 2. Create a personal access token

PATs are issued over your web session (never by another token). While logged
in, run this in the browser console on your instance — or `curl` with your
session cookie:

```js
fetch('/api/v1/tokens', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'local-ai',
    scopes: ['project:read', 'changeset:write', 'changeset:apply',
             'compile:run', 'artifact:read'],
    projectIds: ['<projectId>'],   // optional: scope the token to one project
    expiresInDays: 90,
  }),
}).then(r => r.json()).then(console.log)
```

The response contains `pfp_...` **once** — the server stores only its SHA-256.
Token power is `scopes ∩ your current project role`, evaluated per request;
being removed from a project kills the token's access instantly.

Scope cheat-sheet: a read-only reviewer needs `project:read` +
`changeset:write` only. There is deliberately *no* scope for deleting
projects, managing accounts, or minting tokens.

### 3. Point your MCP client at the bundled server

```bash
cd mcp && npm install
```

Then register it — e.g. Claude Desktop (`claude_desktop_config.json`) or any
MCP client that takes a stdio command:

```json
{
  "mcpServers": {
    "paperforge": {
      "command": "node",
      "args": ["/absolute/path/to/Super-PaperForge/mcp/server.mjs"],
      "env": {
        "PAPERFORGE_URL": "https://latex.example.com",
        "PAPERFORGE_TOKEN": "pfp_...",
        "PAPERFORGE_PROJECT_ID": "clx..."
      }
    }
  }
}
```

The project ID is in the editor URL: `/editor/<projectId>`.

Ten tools become available: `paperforge_snapshot`, `paperforge_read_file`,
`paperforge_propose_changeset`, `paperforge_get_changeset`,
`paperforge_compile`, `paperforge_compilation_status`,
`paperforge_cancel_compilation`, `paperforge_download_pdf`,
`paperforge_apply_changeset`, `paperforge_revert_changeset`.

### 4. The edit loop the AI follows

```
snapshot  →  read file(s)  →  propose changeset  →  compile candidate
                                                        │
                                    ┌── log clean ──────┘
                                    ▼
                          apply changeset (CAS on base revision)
```

1. `paperforge_snapshot` freezes committed source; returns `snapshotId` +
   every file's `fileId` and `sha256`.
2. `paperforge_read_file` returns exact text at that snapshot.
3. `paperforge_propose_changeset` submits `edit_text` / `replace_file` /
   `create_file` / `delete_file` operations pinned to those hashes. The live
   document is untouched — the result is a reviewable diff.
4. `paperforge_compile` + `paperforge_compilation_status` compile the frozen
   candidate. A broken edit costs nothing.
5. `paperforge_apply_changeset` lands it — or fails with
   `409 REVISION_CONFLICT` if the project moved, in which case the agent
   re-snapshots and rebuilds.

Edits are **exact `oldText` → `newText` replacements**: no fuzzy matching,
ambiguous matches are rejected unless `expectedOccurrences` is declared, and
every changeset is all-or-nothing. `Idempotency-Key` headers make retries
safe, and every machine-authored change lands in the audit log.

No MCP? `scripts/paperforge-cli.mjs` exposes the same flow as a plain CLI,
and [`docs/selfhost/EXTERNAL-API.md`](docs/selfhost/EXTERNAL-API.md) documents
the raw REST contract for other integrations.

## API Reference

Full external-API contract:
[`docs/selfhost/EXTERNAL-API.md`](docs/selfhost/EXTERNAL-API.md). Highlights:

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/tokens` | Mint a PAT (session auth) |
| `POST` | `/api/v1/projects/:id/snapshots` | Freeze source, get file hashes |
| `GET`  | `/api/v1/projects/:id/snapshots/:sid/files/:fileId` | Read frozen text |
| `POST` | `/api/v1/projects/:id/changesets` | Propose edits |
| `GET`  | `/api/v1/projects/:id/changesets/:cid` | Inspect diff |
| `POST` | `/api/v1/projects/:id/compile` | Compile live / changeset / snapshot |
| `GET`  | `/api/v1/projects/:id/compile/:cid/status` | Status + log |
| `GET`  | `/api/v1/projects/:id/compile/:cid/pdf` | PDF bytes |
| `POST` | `/api/v1/projects/:id/changesets/:cid/apply` | Land under revision CAS |
| `POST` | `/api/v1/projects/:id/changesets/:cid/revert` | Inverse candidate |

Plus the full browser-app API: projects CRUD, files, members, share links,
snapshots, versions/diff/restore, Git link/pull/push, templates, admin,
billing.

## Project Structure

```
├── src/                  # Next.js app, REST API, services, components
├── worker/               # BullMQ compile worker (own package, Docker)
├── websocket/            # Yjs collaboration server (own package)
├── runner/               # Isolated compile runner (Python)
├── tex-runtime/          # Compile job script + minimal runtime image
├── texlive/              # TeX Live Docker image
├── mcp/                  # MCP server for local AI clients
├── prisma/               # Schema + migrations + seeds
├── nginx/                # Reverse proxy config
├── infra/minio/          # MinIO image build
├── docs/                 # External API contract, write-path map, ops runbooks
├── scripts/              # paperforge-cli.mjs, test-env helpers
└── tests/                # Vitest unit + integration suites
```

## Development

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm test              # vitest unit + integration (2,200+ tests)
npm run build         # production build
npm run validate      # all of the above
```

Real-database acceptance tests run against the isolated stack in
`docker-compose.test.yml` (separate loopback ports, `-test` suffixed
resources):

```bash
./scripts/test-env.sh up && ./scripts/test-env.sh migrate
RUN_DESTRUCTIVE_TESTS=1 npm run test:integration
```

Sub-packages build independently: `cd worker && npm run build`,
`cd websocket && npm run build`.

## Deployment

`docker-compose.yml` is the reference production topology: nginx publishes
port 80, every datastore port binds to loopback, the app image runs as
non-root, and required secrets fail fast instead of shipping weak defaults.
See `.env.example` for the annotated variable list — notable knobs:

- `PAPERFORGE_MODE=selfhost` — private-instance defaults: no billing, no
  public signup, local compile only.
- `ENABLE_EXTERNAL_APPLY` — gate for external changeset apply/revert.
- `EDITOR_SYNC_MODE=versioned` — conditional-PUT saves; `yjs` restores the
  legacy write channel.
- `COMPILATION_BACKEND=local` / `ALLOW_REMOTE_COMPILE=false` — never send a
  manuscript to a third-party compile API.
- `TEX_RUNTIME_FINGERPRINT` / `TEX_IMAGE_DIGEST` — pin and enforce the TeX
  image identity for reproducible builds.

## Security

- Auth.js v5 sessions, bcrypt passwords, optional Google/GitHub OAuth.
- PAT auth for automation: SHA-256 stored, scoped, project-restricted,
  `scopes ∩ role` per request, audit-logged.
- AES-256-GCM at rest for OAuth tokens and Git credentials.
- Rate limits on auth, compile, file and token endpoints (Redis sliding
  window, strict mode available).
- Compile sandbox: no network, no secrets env, no shell escape, size caps on
  every artifact and upload.
- See [SECURITY.md](SECURITY.md) for reporting.

## Roadmap

- [ ] Token management UI (PATs are currently API-only)
- [ ] Optional human-approval step between propose and apply
- [ ] Streamable-HTTP transport for the MCP server
- [ ] SyncTeX-accurate PDF↔source mapping in the external API

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Issues and PRs welcome at
[github.com/LiuYu757/Super-PaperForge](https://github.com/LiuYu757/Super-PaperForge).

## License

[MIT License](LICENSE) — © concrete-sangminlee and Super-PaperForge
contributors.

## Acknowledgements

Super-PaperForge builds on the open-source
[PaperForge](https://github.com/concrete-sangminlee/paperforge) project
(MIT). The external API, selfhost mode, compile sandboxing and MCP
integration were developed on top of that codebase.
