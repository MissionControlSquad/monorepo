-- Parity slice (PR #99 tail): persist the structured adapter execution result on AgentRun.
-- Additive + nullable only (back-compat): existing rows and blob-only adapters leave these null.
ALTER TABLE "agent_runs" ADD COLUMN "usageTokensIn" INTEGER;
ALTER TABLE "agent_runs" ADD COLUMN "usageTokensOut" INTEGER;
ALTER TABLE "agent_runs" ADD COLUMN "usageModel" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "errorFamily" TEXT;
ALTER TABLE "agent_runs" ADD COLUMN "exitReason" TEXT;
