-- AlterTable: Preserve audit logs when the actor user is deleted
-- adminId becomes nullable and the FK switches to SET NULL so rows survive.
-- actorEmail snapshots the email at write time for post-deletion traceability.

ALTER TABLE "audit_log" ALTER COLUMN "admin_id" DROP NOT NULL;
ALTER TABLE "audit_log" ADD COLUMN "actor_email" VARCHAR(255);

ALTER TABLE "audit_log" DROP CONSTRAINT IF EXISTS "audit_log_admin_id_fkey";
ALTER TABLE "audit_log"
  ADD CONSTRAINT "audit_log_admin_id_fkey"
  FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL;
