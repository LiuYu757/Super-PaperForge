# AGENTS.md — notes for AI agents working in this repo

## Project

Super-PaperForge is a self-hosted collaborative LaTeX editor: Next.js 15 App
Router + Prisma 7 + BullMQ + MinIO + Redis, plus a Dockerized TeX compile
runtime and an external API (with a bundled MCP server in `mcp/`) for local AI
tools.

## Verify before finishing

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint src
npm test            # vitest (unit + integration, real-DB suite excluded)
npm run build       # next build
```

Sub-packages build independently: `npm run build` inside `worker/` and
`websocket/`. The real-DB acceptance suite needs the isolated stack from
`docker-compose.test.yml` (`./scripts/test-env.sh up && migrate`, then
`npm run test:integration`).

## Conventions that bite

- Client components read public env via `@/lib/client-env`; never import the
  server-only `@/lib/env` from client code.
- `src/lib/app-url.ts` reads `process.env` at call time on purpose — tests
  mutate env vars during a run.
- `required()` helpers in `worker/` and `websocket/` fail fast on missing
  config, unlike the main app's lenient defaults.
- External writes go through the versioned path
  (`docs/selfhost/EXTERNAL-API.md`, `docs/selfhost/WRITE-PATH-MAP.md`):
  changesets are proposals; `apply` is compare-and-set on the project
  revision and gated by `ENABLE_EXTERNAL_APPLY`.
