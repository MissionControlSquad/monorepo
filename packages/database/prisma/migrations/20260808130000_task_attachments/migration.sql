-- Task artifact attachments (parity: agent/user attaches a produced file to a task/issue). One
-- additive table; no backfill (starts empty). Reuses the shared R2 bucket under the `attachments/`
-- prefix (no new bucket). workspaceId is a plain buildbase id (no FK, D5); taskId cascades from
-- the owning task so an attachment never outlives its task.

CREATE TABLE "task_attachments" (
  "id"                  TEXT NOT NULL,
  "workspaceId"         TEXT NOT NULL,
  "taskId"              TEXT NOT NULL,
  "storageKey"          TEXT NOT NULL,
  "fileName"            TEXT NOT NULL,
  "contentType"         TEXT NOT NULL,
  "byteSize"            INTEGER NOT NULL DEFAULT 0,
  "status"              TEXT NOT NULL DEFAULT 'pending',
  "uploadedByProfileId" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_attachments_workspaceId_idx" ON "task_attachments"("workspaceId");
CREATE INDEX "task_attachments_taskId_createdAt_idx" ON "task_attachments"("taskId", "createdAt");

ALTER TABLE "task_attachments"
  ADD CONSTRAINT "task_attachments_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
