# Billing Smoke Test Plan

Status: Active operational artifact
Run: before every release that touches billing/entitlements, and after rotating
the webhook secret.

The goal is to confirm the revenue loop end-to-end without charging a real card,
using the webhook's signature format directly.

## 0. Preconditions

- `BILLING_WEBHOOK_SECRET` set in the target environment.
- A test user exists with a known email and id.
- Admin access for the audit-log and users views.

## 1. Catalog & checkout surface

- [ ] `GET /api/v1/billing/plans` returns Free/Pro/Team from the central catalog.
- [ ] `/pricing` and `/billing` render the same plan data and CTAs.
- [ ] `POST /api/v1/billing/checkout` returns a hosted-checkout URL when
      configured, else the sales-assisted mailto fallback.
- [ ] `/billing/success` and `/billing/cancel` render for an authenticated user.

## 2. Webhook — activation

- [ ] Send a signed `checkout.session.completed` with `metadata.planId=pro` and
      `client_reference_id=<userId>`. Expect 200 `{handled:true, plan:"pro"}`.
- [ ] User's `settings.billingPlan` = `pro` and `storageQuotaBytes` matches Pro.
- [ ] Audit log shows `billing.subscription_activated` + `billing.webhook_processed`.

## 3. Webhook — security & idempotency

- [ ] Tampered/invalid signature → 400 `INVALID_SIGNATURE`, no plan change.
- [ ] Missing signature header → 400.
- [ ] Stale timestamp (> 5 min) → 400 (replay protection).
- [ ] Re-send the same event id → 200 `{handled:false, reason:"duplicate"}`,
      no second mutation.
- [ ] Unset secret env → endpoint returns 503 `WEBHOOK_NOT_CONFIGURED`.

## 4. Webhook — downgrade

- [ ] Send a signed `customer.subscription.deleted` for the user. Expect plan →
      `free`, quota reset, audit `billing.subscription_canceled`.

## 5. Entitlement effects

- [ ] On Pro: DOCX/ZIP/SyncTeX export allowed; compile priority elevated.
- [ ] On Free (after downgrade): rich exports blocked with upgrade messaging;
      project/collaborator limits enforced.

## 6. Manual fallback

- [ ] Admin `PATCH /api/v1/admin/users/[id]` with `plan` provisions the same
      `settings.billingPlan` (the pre-webhook sales-assisted path still works).
