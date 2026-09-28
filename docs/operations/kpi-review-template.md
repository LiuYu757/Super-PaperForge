# Post-Launch KPI Review Template

Status: Active operational artifact
Cadence: per release + monthly business review.

Copy this template per review. Pull numbers from the admin analytics
(`/api/v1/admin/analytics`), compile SLA (`/api/v1/admin/compile-sla`), and the
audit log. These map to the metrics in the SaaS operating model.

```text
Review date:
Release / period:
Owner:

── Acquisition ──────────────────────────────
New registrations (today / 7d):
Top campaign sources (from settings.attribution):     # first-touch attribution
Notable channel changes:

── Activation ───────────────────────────────
Verified-email rate:                                   # verified_email marker
First-project rate:                                    # created_project marker
Time-to-first-compile (qualitative if not instrumented):
Activation funnel drop-off notes:

── Monetization ─────────────────────────────
Free → Pro conversions (audit: billing.subscription_activated):
Cancellations (audit: billing.subscription_canceled):
Failed/duplicate webhook events:
Manual (admin-provisioned) plans:

── Reliability (paid value) ─────────────────
Compile success rate (24h / 7d):
Compile p95 latency vs target (meetsTarget?):
WebSocket peak connections / docs (/metrics):
Incidents this period (sev, MTTR):

── Cost / margin ────────────────────────────
Storage used by paid accounts:
AI assist volume vs caps:

── Decisions & next bets ────────────────────
What worked:
What to change:
Roadmap impact (which sprint/pickup):
```

## Notes

- Attribution is first-touch (`settings.attribution`), captured at registration
  from utm_* / referrer hints.
- Activation markers are first-reached timestamps under
  `settings.activationEvents`.
- Subscription state changes are auditable events, not just current plan, so the
  conversion/churn counts are reconstructable from the audit log.
