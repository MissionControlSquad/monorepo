-- Epic #11: hierarchical goals. 1 table, 2 enums.

CREATE TYPE "GoalLevel" AS ENUM ('company', 'team', 'task');
CREATE TYPE "GoalStatus" AS ENUM ('planned', 'active', 'completed', 'archived');

CREATE TABLE "goals" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "level" "GoalLevel" NOT NULL DEFAULT 'task',
  "status" "GoalStatus" NOT NULL DEFAULT 'planned',
  "parentId" TEXT,
  "ownerAgentId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "goals_workspaceId_level_status_idx" ON "goals"("workspaceId", "level", "status");
CREATE INDEX "goals_workspaceId_parentId_idx" ON "goals"("workspaceId", "parentId");

ALTER TABLE "goals" ADD CONSTRAINT "goals_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "goals" ADD CONSTRAINT "goals_ownerAgentId_fkey"
  FOREIGN KEY ("ownerAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
