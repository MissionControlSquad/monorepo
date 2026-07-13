-- Epic #11b: wire goals into tasks. Task.goalId + Project.goalId (default goal), both FK → Goal SetNull.

ALTER TABLE "tasks" ADD COLUMN "goalId" TEXT;
CREATE INDEX "tasks_goalId_idx" ON "tasks"("goalId");
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects" ADD COLUMN "goalId" TEXT;
ALTER TABLE "projects" ADD CONSTRAINT "projects_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
