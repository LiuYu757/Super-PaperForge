CREATE TABLE "candidate_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "change_set_id" UUID NOT NULL,
  "base_snapshot_id" UUID NOT NULL,
  "manifest" JSONB NOT NULL,
  "source_hash" VARCHAR(64) NOT NULL,
  "build_fingerprint" VARCHAR(64),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "candidate_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_snapshots_change_set_id_key" UNIQUE ("change_set_id"),
  CONSTRAINT "candidate_snapshots_change_set_id_fkey" FOREIGN KEY ("change_set_id")
    REFERENCES "change_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "candidate_snapshots_base_snapshot_id_fkey" FOREIGN KEY ("base_snapshot_id")
    REFERENCES "source_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "candidate_snapshot_files" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidate_snapshot_id" UUID NOT NULL,
  "file_id" UUID,
  "path" VARCHAR(1024) NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "is_binary" BOOLEAN NOT NULL,
  "mime_type" VARCHAR(255),
  "text_content" TEXT,
  "binary_content" BYTEA,
  "blob_key" TEXT,
  CONSTRAINT "candidate_snapshot_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "candidate_snapshot_files_candidate_snapshot_id_path_key"
    UNIQUE ("candidate_snapshot_id", "path"),
  CONSTRAINT "candidate_snapshot_files_candidate_snapshot_id_fkey"
    FOREIGN KEY ("candidate_snapshot_id") REFERENCES "candidate_snapshots"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "candidate_snapshot_files_one_source_check" CHECK (
    ("is_binary" = false AND "text_content" IS NOT NULL AND "binary_content" IS NULL AND "blob_key" IS NULL)
    OR
    ("is_binary" = true AND "text_content" IS NULL AND
      (("binary_content" IS NOT NULL AND "blob_key" IS NULL)
       OR ("binary_content" IS NULL AND "blob_key" IS NOT NULL)))
  )
);
