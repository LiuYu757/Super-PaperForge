ALTER TABLE "compilations"
  ADD COLUMN "source_snapshot_id" UUID,
  ADD COLUMN "candidate_snapshot_id" UUID,
  ADD COLUMN "source_hash" VARCHAR(64),
  ADD COLUMN "build_fingerprint" VARCHAR(64),
  ADD COLUMN "cancel_requested_at" TIMESTAMPTZ;

ALTER TABLE "compilations"
  ADD CONSTRAINT "compilations_source_snapshot_id_fkey" FOREIGN KEY ("source_snapshot_id")
    REFERENCES "source_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "compilations_candidate_snapshot_id_fkey" FOREIGN KEY ("candidate_snapshot_id")
    REFERENCES "candidate_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "compilations_one_source_check" CHECK (
    "source_snapshot_id" IS NULL OR "candidate_snapshot_id" IS NULL
  );

CREATE INDEX "compilations_source_snapshot_id_idx" ON "compilations"("source_snapshot_id");
CREATE INDEX "compilations_candidate_snapshot_id_idx" ON "compilations"("candidate_snapshot_id");
