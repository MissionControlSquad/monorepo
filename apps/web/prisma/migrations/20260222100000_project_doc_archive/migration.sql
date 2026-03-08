-- AlterEnum
ALTER TYPE "ProjectDocEditAction" ADD VALUE 'archived';

-- AlterTable
ALTER TABLE "project_docs" ADD COLUMN "archivedAt" TIMESTAMP(3);
