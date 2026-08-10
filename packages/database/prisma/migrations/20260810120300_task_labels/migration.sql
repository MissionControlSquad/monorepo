-- Parity §3.12: first-class task labels. Reuses the generic workspace-scoped `labels` table (shared
-- with cases) via a join, so a task can carry structured labels beyond the freeform tags[]. One
-- additive join table; starts empty. workspaceId is a plain buildbase id (no FK, D5). Both the task
-- and the label cascade-delete their join rows.
CREATE TABLE "task_labels" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "taskId"      TEXT NOT NULL,
  "labelId"     TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_labels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_labels_taskId_labelId_key" ON "task_labels"("taskId", "labelId");
CREATE INDEX "task_labels_workspaceId_taskId_idx" ON "task_labels"("workspaceId", "taskId");
CREATE INDEX "task_labels_labelId_idx" ON "task_labels"("labelId");

ALTER TABLE "task_labels"
  ADD CONSTRAINT "task_labels_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_labels"
  ADD CONSTRAINT "task_labels_labelId_fkey"
  FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;
