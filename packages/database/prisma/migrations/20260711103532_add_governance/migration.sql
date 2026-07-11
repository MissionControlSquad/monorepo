-- Epic #3: Governance (Approvals + Agent Trust). Agent-domain, workspaceId-scoped (no FK).
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'needs_changes', 'cancelled');
CREATE TYPE "ApprovalSubjectType" AS ENUM ('task', 'deliverable', 'hire_agent');
CREATE TYPE "TrustLevel" AS ENUM ('untrusted', 'low', 'standard', 'trusted');

ALTER TABLE "agents" ADD COLUMN "trustLevel" "TrustLevel";

CREATE TABLE "approvals" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "subjectType" "ApprovalSubjectType" NOT NULL,
  "subjectId" TEXT NOT NULL, "taskId" TEXT, "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
  "title" TEXT NOT NULL, "reason" TEXT, "requestedById" TEXT NOT NULL, "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3), "decisionNote" TEXT, "resubmitCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approvals_workspaceId_status_idx" ON "approvals"("workspaceId", "status");
CREATE INDEX "approvals_subjectType_subjectId_idx" ON "approvals"("subjectType", "subjectId");
CREATE INDEX "approvals_taskId_idx" ON "approvals"("taskId");
CREATE INDEX "approvals_requestedById_idx" ON "approvals"("requestedById");
CREATE INDEX "approvals_status_createdAt_idx" ON "approvals"("status", "createdAt");

CREATE TABLE "approval_comments" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "approvalId" TEXT NOT NULL,
  "authorProfileId" TEXT NOT NULL, "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_comments_approvalId_createdAt_idx" ON "approval_comments"("approvalId", "createdAt");
CREATE INDEX "approval_comments_workspaceId_idx" ON "approval_comments"("workspaceId");

CREATE TABLE "agent_trust_profiles" (
  "agentId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
  "trustLevel" "TrustLevel" NOT NULL DEFAULT 'standard',
  "lowTrustContainment" BOOLEAN NOT NULL DEFAULT false,
  "requireUntrustedPrReview" BOOLEAN NOT NULL DEFAULT false,
  "autoPromoteWorkProduct" BOOLEAN NOT NULL DEFAULT true,
  "sourceTrustBadge" TEXT, "changeConsentRequired" BOOLEAN NOT NULL DEFAULT false,
  "executionAllowlist" TEXT[] DEFAULT ARRAY[]::TEXT[], "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_trust_profiles_pkey" PRIMARY KEY ("agentId")
);
CREATE INDEX "agent_trust_profiles_workspaceId_trustLevel_idx" ON "agent_trust_profiles"("workspaceId", "trustLevel");

ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "approval_comments" ADD CONSTRAINT "approval_comments_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_comments" ADD CONSTRAINT "approval_comments_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_trust_profiles" ADD CONSTRAINT "agent_trust_profiles_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: default trust profile per existing agent.
INSERT INTO "agent_trust_profiles" ("agentId","workspaceId","trustLevel","updatedAt")
SELECT id, COALESCE("workspaceId",'ws_default'), 'standard', now() FROM "agents"
ON CONFLICT ("agentId") DO NOTHING;
UPDATE "agents" a SET "trustLevel" = t."trustLevel" FROM "agent_trust_profiles" t WHERE t."agentId" = a.id;
