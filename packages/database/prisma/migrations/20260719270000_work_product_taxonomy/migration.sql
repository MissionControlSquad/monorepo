-- Domain 8 G1: work-product taxonomy. New DeliverableKind output types + governance columns.
ALTER TYPE "DeliverableKind" ADD VALUE IF NOT EXISTS 'pull_request';
ALTER TYPE "DeliverableKind" ADD VALUE IF NOT EXISTS 'branch';
ALTER TYPE "DeliverableKind" ADD VALUE IF NOT EXISTS 'commit';
ALTER TYPE "DeliverableKind" ADD VALUE IF NOT EXISTS 'preview_url';
ALTER TYPE "DeliverableKind" ADD VALUE IF NOT EXISTS 'runtime_service';

ALTER TABLE "deliverables" ADD COLUMN "provider" TEXT;
ALTER TABLE "deliverables" ADD COLUMN "externalId" TEXT;
ALTER TABLE "deliverables" ADD COLUMN "reviewState" TEXT;
ALTER TABLE "deliverables" ADD COLUMN "outputStatus" TEXT;
ALTER TABLE "deliverables" ADD COLUMN "healthStatus" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "deliverables" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "deliverables" ADD COLUMN "createdByRunId" TEXT;
CREATE INDEX "deliverables_taskId_kind_idx" ON "deliverables"("taskId", "kind");
