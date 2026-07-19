-- Tier D: per-agent runtime adapter selection.
ALTER TABLE "agents" ADD COLUMN "runtimeAdapter" TEXT;
ALTER TABLE "agents" ADD COLUMN "runtimeModel" TEXT;
ALTER TABLE "agents" ADD COLUMN "runtimeTemplate" TEXT;
