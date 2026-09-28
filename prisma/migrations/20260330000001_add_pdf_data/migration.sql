-- AlterTable: Store compiled PDF directly in DB when MinIO unavailable
ALTER TABLE "compilations" ADD COLUMN "pdf_data" BYTEA;
