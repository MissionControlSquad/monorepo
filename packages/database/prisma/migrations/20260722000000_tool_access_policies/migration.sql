-- Tool access-policy (parity #21): declarative allow/deny rules over tool names (workspace/agent).
CREATE TABLE "tool_access_policies" (
  "id"          TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "agentId"     TEXT,
  "toolPattern" TEXT NOT NULL,
  "effect"      TEXT NOT NULL DEFAULT 'allow',
  "priority"    INTEGER NOT NULL DEFAULT 0,
  "reason"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tool_access_policies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tool_access_policies_workspaceId_agentId_idx" ON "tool_access_policies"("workspaceId", "agentId");
