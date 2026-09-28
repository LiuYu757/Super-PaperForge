# PaperForge Release Checklist

Status: Active operational artifact

A release is a deliberate, verified event — not a random push. Run this before
promoting `main` to production.

## Pre-flight (local / CI)

- [ ] `npm run typecheck` clean
- [ ] `npm run lint` clean
- [ ] `npm test` green (note skipped Redis-dependent tests if Redis absent)
- [ ] `npm run build` succeeds
- [ ] Worker package builds: `cd worker && npm run build`
- [ ] WebSocket package builds: `cd websocket && npm run build`
- [ ] Prisma schemas validate (root + worker + websocket) and stay in sync
- [ ] Billing smoke test plan executed (see `billing-smoke-test.md`)

## Migrations & config

- [ ] Any new env vars added to `.env.example` and the deploy secret store
- [ ] DB migrations reviewed and reversible; backup taken immediately before
- [ ] Feature flags / provider secrets (`BILLING_WEBHOOK_SECRET`, OAuth) set in
      the target environment

## Deploy

- [ ] Deploy app, worker, and websocket together (compatible versions)
- [ ] `GET /api/healthz` returns 200 with db/redis/minio = ok
- [ ] WebSocket `/healthz` = ok (auth secret present) and `/metrics` reachable
- [ ] Smoke: register → verify email (welcome email) → create project → compile →
      download PDF

## Post-deploy

- [ ] Watch `/api/v1/admin/compile-sla` for 15 min — success rate steady, p95
      within target
- [ ] Watch `/api/v1/admin/workers` — queue drains, no failed spike
- [ ] Public copy (landing/pricing/README) matches shipped behavior (DoD)
- [ ] Update the UI changelog (`src/app/changelog/page.tsx`)
- [ ] Tag the release; record KPIs (see `kpi-review-template.md`)

## Rollback

- [ ] Re-deploy the previous app/worker/websocket versions together
- [ ] Restore DB from pre-migration backup only if a migration is implicated
- [ ] Confirm `/api/healthz` 200 and a successful end-to-end compile
