-- AlterTable: Add token_version for JWT session invalidation on password change
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
