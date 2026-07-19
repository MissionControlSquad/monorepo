-- Domain 8 G6.5: typed thread interactions.
CREATE TABLE "task_thread_interactions" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "sourceMessageId" TEXT,
  "sourceRunId" TEXT,
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "createdByProfileId" TEXT,
  "resolvedByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "task_thread_interactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "task_thread_interactions_taskId_status_idx" ON "task_thread_interactions"("taskId", "status");
ALTER TABLE "task_thread_interactions" ADD CONSTRAINT "task_thread_interactions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
