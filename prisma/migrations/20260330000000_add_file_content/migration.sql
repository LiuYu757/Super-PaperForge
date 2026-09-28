-- AlterTable: Add content column for direct text storage fallback
ALTER TABLE "files" ADD COLUMN "content" TEXT;
