# PaperForge Incident Runbooks

Status: Active operational artifact
Scope: hosted SaaS deployment (Next.js app + worker + websocket + Postgres/Redis/MinIO)

Each runbook follows: **Detect → Triage → Mitigate → Verify → Follow-up**. Health
signals come from `GET /api/healthz` (app: db/redis/minio) and the websocket
server `/healthz` + `/metrics`.

## Severity

| Sev | Meaning | Examples |
|---|---|---|
| SEV1 | Core flow down for all users | Login down, all compiles failing, DB unreachable |
| SEV2 | Degraded / subset impacted | Redis down (compiles fall back to API), MinIO down (PDFs to DB) |
| SEV3 | Minor / cosmetic | Single template broken, slow non-critical page |

## RB-1: Compilation failures spike

- **Detect**: `/api/v1/admin/compile-sla` success rate drops or p95 breaches
  target; `/api/v1/admin/workers` shows rising `failed`.
- **Triage**: Is Redis up (`/api/healthz` → checks.redis)? If down, the app uses
  the synchronous external-API fallback — expect higher latency, not total
  failure. Check worker logs for `latexmk` errors vs infra errors.
- **Mitigate**: restart worker replicas; if a specific compiler is failing,
  confirm TeX Live image integrity. If Redis is the cause, see RB-3.
- **Verify**: SLA success rate recovers on the 24h widget; queue `waiting`
  drains.
- **Follow-up**: capture failing project sample; file a bug if a TeX package is
  missing from the image.

## RB-2: MinIO unavailable

- **Detect**: `/api/healthz` checks.minio = error; PDFs served from DB fallback.
- **Triage**: object-store reachability/credentials. Writes fall back to the DB
  `pdfData`/base64 path (bounded) — usage is degraded, not down (SEV2).
- **Mitigate**: restore MinIO; run `POST /api/v1/admin/storage/recalc` after
  recovery to reconcile cached usage.
- **Verify**: new compiles write to MinIO again (checks.minio = ok).

## RB-3: Redis down

- **Detect**: `/api/healthz` checks.redis = error; rate limiting falls back to
  in-memory (per-instance), compile queue unavailable → API fallback path.
- **Mitigate**: restore Redis (Sentinel/Cluster in prod). Sessions are JWT, so
  auth survives. Yjs in-memory docs are unaffected by app Redis.
- **Verify**: queue resumes; `/api/v1/admin/workers` counts populate.

## RB-4: Database unreachable (SEV1)

- **Detect**: `/api/healthz` returns 503 (db check fails → whole endpoint 503).
- **Mitigate**: check Postgres/PgBouncer; fail over to replica; restore from the
  latest backup if corrupt (see Backup & DR in the design spec, §13).
- **Verify**: `/api/healthz` returns 200.

## RB-5: WebSocket collaboration degraded

- **Detect**: ws `/healthz` degraded (missing auth secret) or `/metrics`
  connections drop to 0 unexpectedly.
- **Triage**: missing `NEXTAUTH_SECRET` makes the ws process exit on boot
  (fail-fast) — check deploy env. Editors still work single-user when
  `NEXT_PUBLIC_WS_URL` is unset.
- **Mitigate**: set the secret, redeploy ws; clients auto-reconnect.

## RB-6: Billing webhook failures

- **Detect**: provider dashboard shows webhook 4xx/5xx; plans not provisioning.
- **Triage**: 503 = `BILLING_WEBHOOK_SECRET` unset; 400 INVALID_SIGNATURE =
  wrong secret or clock skew (replay tolerance 5 min). Duplicates are acked
  idempotently (audit-log ledger).
- **Mitigate**: fix the secret; replay events from the provider. Manual
  fallback: admin provisioning via `PATCH /api/v1/admin/users/[id]` (plan).
- **Verify**: `billing.subscription_activated` appears in the audit log.
