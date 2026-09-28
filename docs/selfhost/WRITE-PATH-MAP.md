# PR-C write path map

The committed project revision is the conflict boundary for all live compile
inputs. Text bytes live in `files.content`; binary bytes live at immutable
`projects/<projectId>/blobs/<uuid>` keys, with a base64 DB fallback only when
object storage was unavailable. `applyDocumentMutationsInTx` serializes writes
by owner and project, checks file/project limits and the owner's actual storage
usage, updates the usage cache, advances the revision, and inserts an audit row
in one PostgreSQL transaction. A failed transaction leaves none of these DB
changes. Staged binary objects are removed on failure when possible; any
remaining unreferenced object is inert and can be garbage collected later.

| Entry point | Compile input changed | PR-C route |
| --- | --- | --- |
| Browser text PUT / conditional DELETE | Text bytes / file set | `applyDocumentMutations`; exact text hash or create/existence condition at HTTP boundary |
| Browser file/folder rename | Paths and possibly `mainFile` | `rename` / `renamePrefix` in the same transaction |
| Binary upload / replacement | Binary bytes and file row | Unique object staged first; `upsertBinary` with project revision CAS |
| Git history restore | Entire file set | Stage unique binary objects; one mutation batch with project revision CAS; explicit type conversion |
| ZIP / GitHub URL import | Initial file set | Parse before creation; project, membership and text files commit together; failure leaves no project |
| Template creation | Initial text and binary file set | Read source bytes before creation; project, membership and all files commit together |
| Blank project creation | No file bytes yet | Creates project and owner at revision 0; later file creation uses the mutation core |
| Project PATCH `compiler` / `mainFile` | Compiler settings | Project update advances revision and writes audit in one transaction |
| Changeset apply / revert | Text bytes / file set | Existing `applyDocumentMutationsInTx` with `baseRevision` CAS |
| Account deletion | Removes entire account and projects | Separate account lifecycle transaction; no surviving project accepts writes |
| Git remote link, sharing, members, archive/name/description | No compile bytes/settings | Project metadata only; revision need not advance |
| `report-text-source.mjs --backfill` | Legacy null text to recovered bytes | Controlled migration: owner/project/file locks, revision bump, quota cache and audit in one transaction |
| Yjs and `ENABLE_EXTERNAL_APPLY` | Disabled write channels in selfhost | Remain disabled until later release gates |

## Migration gate

Run `node scripts/report-text-source.mjs` against the intended deployment
before enabling ordinary compilation. A live text row with `content = NULL`
is explicitly legacy; the worker fails that compile job instead of reading an
old object or silently omitting the file. The report exits nonzero for missing
DB text, missing legacy bytes, or divergent DB/object content. `--backfill`
copies only rows still null under locks; divergent rows require manual review.
It never overwrites a non-null DB body with object bytes.

## Boundaries reserved for later work

PR-D now stores full source and candidate snapshots with frozen text, real
binary byte hashes, and immutable binary object references. `sourceHash` covers
every path and actual content hash plus main file and compiler. A
`buildFingerprint` is only populated when `TEX_RUNTIME_FINGERPRINT` is pinned;
an unset runtime cannot claim a reproducible build identity. Manifest-only
legacy snapshots have `sourceHash = NULL` and return 410 on file reads.

The current compile queue payload is still captured from mutable project rows
when the job is queued, so a compile is not yet a durable historical snapshot.
PR-E covers end-to-end candidate/PAT compilation, worker sandboxing and
deployment smoke tests. The external apply gate stays closed.
