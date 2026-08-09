-- Domain 8 G2: untrusted-output review gate on agent_runs (makes requireUntrustedPrReview real).
ALTER TABLE "agent_runs" ADD COLUMN "reviewState" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "sourceTrust" JSONB;
ALTER TABLE "agent_runs" ADD COLUMN "reviewedByProfileId" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "reviewedAt" TIMESTAMP(3);
CREATE INDEX "agent_runs_workspaceId_reviewState_idx" ON "agent_runs"("workspaceId", "reviewState");
