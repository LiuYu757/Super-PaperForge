# External API — snapshots and changesets

This is the interface a local AI tool uses to read a paper, propose edits and
land them. It exists so that automation writes through the **same validated
path** a human does, with an explicit version check on every write.

The server never calls a language model. It has no model provider keys and no
outbound connection to any AI service. All reasoning happens on your machine;
this API only accepts the resulting edits.

## The loop

```
POST /snapshots                → snapshotId + file hashes  (read a fixed state)
GET  /snapshots/{sid}/files/{fileId} → exact text of one file
POST /changesets               → candidate diff, live document untouched
POST /compile {changeSetId}     → compile the frozen candidate, live document untouched
GET  /compile/{compileId}/status → status and log
GET  /compile/{compileId}/pdf   → compiled PDF bytes
POST /changesets/{cid}/apply   → lands it, or 409 if the project moved
```

A changeset is a *proposal*. Creating one changes nothing. You can inspect the
diff, compile it, and discard it at no cost. Only `apply` touches the shared
manuscript, and it does so under a compare-and-set on the project revision.

`POST /compile` without a body compiles a frozen snapshot of the current
committed project. With `{"changeSetId":"…"}`, it compiles that changeset's
immutable candidate. With `{"snapshotId":"…"}`, it compiles that frozen
historical source; a manifest-only legacy snapshot returns 410. The response
is an acceptance receipt; use the status
endpoint to observe queueing, success, failure or cancellation. A PAT needs
`compile:run` to start or cancel and `artifact:read` to read status, logs and
PDF. `POST /compile/{compileId}/cancel` requests cancellation; a finished job
cannot be retroactively cancelled.

## Authentication

Create a token from the web UI (or `POST /api/v1/tokens`) and send it as:

```
Authorization: Bearer pfp_...
```

The plaintext is shown once. The server stores only its SHA-256.

**A token is never an independent grant.** Effective permission is
`token scopes ∩ the owner's current project role`, resolved on every request.
Removing someone from a project immediately disables their tokens — no
revocation step needed.

### Scopes

| Scope | Allows |
|---|---|
| `project:read` | List files, create and read snapshots |
| `changeset:write` | Create candidate changesets and reverts |
| `changeset:apply` | Land a changeset on the live document |
| `compile:run` | Trigger a compile |
| `artifact:read` | Download PDF and logs |

There is deliberately **no scope** for deleting projects, managing accounts,
issuing tokens, or anything resembling command execution. A leaked automation
token cannot escalate itself.

Issue narrow tokens. A tool that only proofreads needs `project:read` and
`changeset:write` — not `changeset:apply`.

## Editing

Edits are exact `oldText` → `newText` replacements, checked against the hash you
read:

```json
POST /api/v1/projects/{id}/changesets
{
  "baseSnapshotId": "snap_...",
  "message": "Tighten the abstract",
  "operations": [
    {
      "op": "edit_text",
      "fileId": "file_...",
      "expectedSha256": "<hash from the snapshot>",
      "edits": [
        { "oldText": "We propose a novel method", "newText": "We propose a method" }
      ]
    }
  ]
}
```

Rules that will not bend:

- **No fuzzy matching.** If `oldText` is not found exactly, you get `409
  EDIT_NOT_FOUND`. The server never guesses at what you meant.
- **Ambiguity is an error.** If the text appears more than once, you get `409
  EDIT_AMBIGUOUS` unless you state `expectedOccurrences`. Include more
  surrounding context to make a match unique.
- **Edits resolve against the original text**, not against each other's output,
  and overlapping edits are rejected. A first edit can never change what a
  second one matches.
- **All-or-nothing.** If any operation in a changeset fails, nothing is written.
  A `.tex` change and its matching `.bib` change cannot half-land.

Other operations: `replace_file`, `create_file`, `delete_file`.

## Conflicts

`apply` only succeeds if the project is still at the revision the changeset was
based on. Otherwise:

```
409 REVISION_CONFLICT
"Project has moved to revision 47 since this changeset was based on 42."
```

Re-read, rebuild the changeset, retry. The server will not merge silently and
will not overwrite the newer text. This is the property the whole design exists
to protect: **you cannot lose someone else's paragraph by accident.**

## Retries

Send an `Idempotency-Key` header on `changesets`, `apply`, `revert`, and `compile`. A retry with the
same key and the same body replays the original response instead of performing
the write again — a dropped response will not apply the same edit twice.

Reusing a key with a *different* body is `409 IDEMPOTENCY_KEY_REUSED`, not a
cache hit.

Keys are 1–255 printable characters. JSON object keys are sorted recursively
before computing the request hash; array order stays meaningful. A key is
scoped to the principal, project, and operation. Idempotency records have no
time-based expiry while their project exists, so an old retry cannot create a
second changeset after a cleanup interval. Browser file PUT/DELETE also accept
the header and bind it to the path, content and version precondition. Without
the header, those writes still require their version precondition, and a
duplicate request may receive 412/404 after the first one succeeded.

## Undo

`POST /changesets/{cid}/revert` builds the inverse as a **new candidate**, which
you then apply like any other change. It is not a project-wide reset: if a file
has been edited since, you get `409 REVERT_CONFLICT` rather than silently
discarding that person's work.

## Errors

| Status | Meaning |
|---|---|
| 400 | Malformed request |
| 401 | Missing, invalid, expired or revoked token |
| 403 | Authenticated, but missing the scope or project role |
| 404 | Not found, or outside this token's project scope |
| 409 | Conflict — edit not found, ambiguous, or the project moved |
| 429 | Rate limited |
| 503 | A file could not be read; no partial state was written |

A 409 is normal operation, not a failure. It means the safety check did its job.

## Auditing

Snapshot creation, changeset creation, apply and revert are all written to the
audit log with the acting user and the token used. Machine-authored changes are
attributable.
