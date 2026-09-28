ALTER TABLE "source_snapshots"
  ADD COLUMN "source_hash" VARCHAR(64),
  ADD COLUMN "build_fingerprint" VARCHAR(64);

CREATE TABLE "snapshot_files" (
  "snapshot_id" UUID NOT NULL,
  "file_id" UUID NOT NULL,
  "path" VARCHAR(1024) NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "size_bytes" BIGINT NOT NULL,
  "is_binary" BOOLEAN NOT NULL,
  "mime_type" VARCHAR(255),
  "text_content" TEXT,
  "binary_content" BYTEA,
  "blob_key" TEXT,
  CONSTRAINT "snapshot_files_pkey" PRIMARY KEY ("snapshot_id", "file_id"),
  CONSTRAINT "snapshot_files_snapshot_id_fkey" FOREIGN KEY ("snapshot_id")
    REFERENCES "source_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "snapshot_files_one_source_check" CHECK (
    ("is_binary" = false AND "text_content" IS NOT NULL AND "binary_content" IS NULL AND "blob_key" IS NULL)
    OR
    ("is_binary" = true AND "text_content" IS NULL AND
      (("binary_content" IS NOT NULL AND "blob_key" IS NULL)
       OR ("binary_content" IS NULL AND "blob_key" IS NOT NULL)))
  )
);

CREATE INDEX "snapshot_files_snapshot_id_path_idx" ON "snapshot_files"("snapshot_id", "path");
