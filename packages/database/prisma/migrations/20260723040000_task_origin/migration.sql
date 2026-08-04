-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "originKind" TEXT,
    ADD COLUMN "originRunId" TEXT,
    ADD COLUMN "originFingerprint" TEXT,
    ADD COLUMN "requestDepth" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: per-origin idempotency — a fingerprint may exist at most once (partial unique).
CREATE UNIQUE INDEX "tasks_originFingerprint_key" ON "tasks"("originFingerprint") WHERE "originFingerprint" IS NOT NULL;
CREATE INDEX "tasks_originKind_idx" ON "tasks"("originKind");
