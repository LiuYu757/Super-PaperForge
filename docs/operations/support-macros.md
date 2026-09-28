# PaperForge Support Macro Library

Status: Active operational artifact

Reusable responses for common tickets. Keep them honest and link to the actual
behavior. Placeholders in `{{ }}`.

## Account & auth

**Verification email not received**
> Hi {{name}}, verification links expire after 24 hours. Please request a new
> one by registering again with the same email, or check spam. If your account
> already shows as verified, you can sign in directly. We never reveal whether
> an email is registered, so the request always returns the same message.

**Password reset**
> Reset links are valid for 1 hour and single-use. Request a fresh link from the
> "Forgot password" page. Repeated requests are rate-limited to prevent abuse.

**Locked out after failed logins**
> For your security, accounts lock after repeated failed attempts. It clears
> automatically; if you're still blocked, reply here and we'll review.

## Compilation

**My document won't compile**
> Compilation errors are shown inline in the editor log. Common causes: a missing
> package, a typo in a `\begin/\end` pair, or a missing main file. If you believe
> it's a platform issue, send the project name and we'll check the SLA dashboard
> and worker logs.

**Compilation is slow**
> Paid plans get priority in the compile queue. We track p95 latency against our
> target; if we're breaching it we treat it as an incident. Share the project and
> a timestamp and we'll investigate.

## Billing

**Upgraded but still on Free**
> Plan changes apply when our payment provider confirms via webhook — usually
> within a moment. If it hasn't updated, reply with your account email and we'll
> reconcile it manually (your payment is safe).

**Export blocked (DOCX/ZIP/SyncTeX)**
> PDF export is free; DOCX, ZIP, and SyncTeX exports are on paid plans. The limit
> follows the project owner's plan. Upgrade from the Billing page to enable them.

**Team / lab purchase**
> Start a Team inquiry from the Billing or Pricing page and our team will help
> with seats, invoicing, and onboarding.

## Collaboration & storage

**Can't invite more collaborators**
> Collaborator limits per project follow the owner's plan (Free: 2, Pro: 10,
> Team: unlimited). Upgrade the owner's plan or transfer ownership.

**Out of storage**
> Storage quota follows your plan. Delete unused projects/files or upgrade. If
> usage looks wrong after an outage, we can recompute it from our records.

## Escalation

- SEV1 (core flow down): page on-call, open an incident, follow `incident-runbooks.md`.
- Data/security concern: escalate immediately, do not self-serve.
