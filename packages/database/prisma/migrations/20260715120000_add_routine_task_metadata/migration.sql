-- Epic #7: routine metadata applied to generated tasks (assignee / priority / goal).

ALTER TABLE "routines"
  ADD COLUMN "assigneeAgentId" TEXT,
  ADD COLUMN "priority" "Priority",
  ADD COLUMN "goalId" TEXT;
