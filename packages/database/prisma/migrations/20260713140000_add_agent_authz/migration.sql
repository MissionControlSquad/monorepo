-- Epic #21: agent authorization — capability grants + audit. 2 tables, 1 enum.

CREATE TYPE "AgentAuthzDecision" AS ENUM ('allow', 'deny');

CREATE TABLE "agent_capability_grants" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "capability" TEXT NOT NULL,
  "projectScope" TEXT,
  "grantedByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_capability_grants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_capability_grants_agentId_capability_idx" ON "agent_capability_grants"("agentId", "capability");
ALTER TABLE "agent_capability_grants" ADD CONSTRAINT "agent_capability_grants_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agent_authz_events" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "capability" TEXT NOT NULL,
  "decision" "AgentAuthzDecision" NOT NULL,
  "projectScope" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_authz_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_authz_events_agentId_createdAt_idx" ON "agent_authz_events"("agentId", "createdAt");
