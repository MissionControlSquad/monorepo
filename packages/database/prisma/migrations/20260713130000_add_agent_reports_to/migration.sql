-- Epic #19: org chart — agent reporting hierarchy. 1 column + self-FK + index.

ALTER TABLE "agents" ADD COLUMN "reportsToAgentId" TEXT;
CREATE INDEX "agents_workspaceId_reportsToAgentId_idx" ON "agents"("workspaceId", "reportsToAgentId");
ALTER TABLE "agents" ADD CONSTRAINT "agents_reportsToAgentId_fkey"
  FOREIGN KEY ("reportsToAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
