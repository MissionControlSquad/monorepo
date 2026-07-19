-- Domain 9 #6: scheduled retries + backoff on agent_runs.
ALTER TABLE "agent_runs" ADD COLUMN "retryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "agent_runs" ADD COLUMN "scheduledRetryAt" TIMESTAMP(3);
ALTER TABLE "agent_runs" ADD COLUMN "retryReason" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "retryOfRunId" TEXT;
CREATE INDEX "agent_runs_scheduledRetryAt_idx" ON "agent_runs"("scheduledRetryAt");
