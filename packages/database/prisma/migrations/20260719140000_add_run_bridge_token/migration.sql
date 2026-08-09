-- Tier D / Phase 3 (Plan 6): run-scoped in-sandbox bridge token (hashed at rest).
ALTER TABLE "agent_runs" ADD COLUMN "bridgeTokenHash" TEXT;
CREATE INDEX "agent_runs_bridgeTokenHash_idx" ON "agent_runs"("bridgeTokenHash");
