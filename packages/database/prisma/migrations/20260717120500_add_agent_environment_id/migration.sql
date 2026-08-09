-- Tier D / Phase 3: an agent can be bound to a first-class Environment (where/how it runs).
ALTER TABLE "agents" ADD COLUMN "environmentId" TEXT;
CREATE INDEX "agents_environmentId_idx" ON "agents"("environmentId");
