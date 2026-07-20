-- Domain 14 #10: Agent-Companies foundation.
CREATE TABLE "agent_companies" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "goals" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "schemaVersion" TEXT NOT NULL DEFAULT 'agentcompanies/v1',
  "license" TEXT,
  "authors" JSONB,
  "sourceRef" TEXT,
  "createdByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_companies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_companies_workspaceId_slug_key" ON "agent_companies"("workspaceId", "slug");
CREATE INDEX "agent_companies_workspaceId_idx" ON "agent_companies"("workspaceId");
ALTER TABLE "agents" ADD COLUMN "companyId" TEXT;
