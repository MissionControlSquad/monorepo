-- Domain 9 #11: issue monitor (one-shot deferred wake) fields on tasks.
ALTER TABLE "tasks" ADD COLUMN "monitorNextCheckAt" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "monitorNotes" TEXT;
ALTER TABLE "tasks" ADD COLUMN "monitorAttemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tasks" ADD COLUMN "monitorMaxAttempts" INTEGER;
CREATE INDEX "tasks_monitorNextCheckAt_idx" ON "tasks"("monitorNextCheckAt");
