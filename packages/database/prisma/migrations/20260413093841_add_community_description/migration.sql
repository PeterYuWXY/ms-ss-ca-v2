-- AlterTable
ALTER TABLE "Community" ADD COLUMN     "description" TEXT,
ADD COLUMN     "pricing" JSONB NOT NULL DEFAULT '{}';
