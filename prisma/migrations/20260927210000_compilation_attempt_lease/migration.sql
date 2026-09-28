ALTER TABLE "compilations"
  ADD COLUMN "attempt_id" UUID,
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lease_expires_at" TIMESTAMPTZ,
  ADD COLUMN "started_at" TIMESTAMPTZ;

CREATE INDEX "compilations_status_lease_expires_at_idx"
  ON "compilations" ("status", "lease_expires_at");
