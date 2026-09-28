-- External AI interface: personal access tokens, immutable snapshots,
-- changesets, project revisions and idempotency records.
--
-- Additive only. No existing column is dropped or retyped, so this migration
-- cannot discard manuscript data. Existing projects start at revision 0.

-- Monotonic project revision, bumped in the same transaction as any committed
-- content change so an external client can detect the project moved under it.
ALTER TABLE "projects" ADD COLUMN "revision" BIGINT NOT NULL DEFAULT 0;

-- Personal access tokens. Only the hash is stored; the plaintext is shown once.
CREATE TABLE "api_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "token_prefix" VARCHAR(32) NOT NULL,
    "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "project_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "last_used_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens"("token_hash");
CREATE INDEX "api_tokens_user_id_idx" ON "api_tokens"("user_id");
CREATE INDEX "api_tokens_token_hash_idx" ON "api_tokens"("token_hash");

ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Immutable project snapshots. Compilation inputs reference these instead of
-- "the project's current files", so a queued build cannot mix file versions.
CREATE TABLE "source_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "revision" BIGINT NOT NULL,
    "manifest" JSONB NOT NULL,
    "input_hash" VARCHAR(64) NOT NULL,
    "main_file" VARCHAR(255) NOT NULL,
    "compiler" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "source_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "source_snapshots_project_id_revision_idx" ON "source_snapshots"("project_id", "revision");
CREATE INDEX "source_snapshots_project_id_input_hash_idx" ON "source_snapshots"("project_id", "input_hash");

ALTER TABLE "source_snapshots" ADD CONSTRAINT "source_snapshots_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Candidate changesets. Creating one does not touch the live document.
CREATE TABLE "change_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "base_snapshot_id" UUID NOT NULL,
    "base_revision" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "operations" JSONB NOT NULL,
    "diff" JSONB,
    "result_hash" VARCHAR(64),
    "applied_revision" BIGINT,
    "applied_at" TIMESTAMPTZ,
    "reverts_id" UUID,
    "actor_user_id" UUID,
    "actor_token_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "change_sets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "change_sets_project_id_status_idx" ON "change_sets"("project_id", "status");
CREATE INDEX "change_sets_project_id_created_at_idx" ON "change_sets"("project_id", "created_at" DESC);

ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_base_snapshot_id_fkey"
    FOREIGN KEY ("base_snapshot_id") REFERENCES "source_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "change_sets" ADD CONSTRAINT "change_sets_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Guard against a changeset being applied twice. `applied_revision` is unique
-- per project: two applies of the same changeset would have to claim the same
-- resulting revision, and the second one fails. The apply path additionally
-- updates conditionally on `applied_at IS NULL`, so the race is closed both in
-- the query and in the schema.
CREATE UNIQUE INDEX "change_sets_applied_revision_unique"
    ON "change_sets"("project_id", "applied_revision")
    WHERE "applied_revision" IS NOT NULL;

-- Idempotency records. A retry must not apply the same edit twice.
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "principal" VARCHAR(128) NOT NULL,
    "project_id" UUID NOT NULL,
    "operation" VARCHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "response" JSONB NOT NULL,
    "status_code" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "idempotency_records_unique_key"
    ON "idempotency_records"("principal", "project_id", "operation", "idempotency_key");
CREATE INDEX "idempotency_records_created_at_idx" ON "idempotency_records"("created_at");
