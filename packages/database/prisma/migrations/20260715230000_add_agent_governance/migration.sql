-- Workspace-scoped agent governance policy (enforceable knobs).
CREATE TABLE "agent_governance_policies" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requireAgentApproval" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_governance_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_governance_policies_workspaceId_key" ON "agent_governance_policies"("workspaceId");
