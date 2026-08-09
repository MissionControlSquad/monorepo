-- Domain 7 P1: audit-on-resolve provenance on secret_access_events. Additive columns + index.
ALTER TABLE "secret_access_events" ADD COLUMN "consumerType" TEXT;
ALTER TABLE "secret_access_events" ADD COLUMN "consumerId" TEXT;
ALTER TABLE "secret_access_events" ADD COLUMN "configPath" TEXT;
ALTER TABLE "secret_access_events" ADD COLUMN "outcome" TEXT;
ALTER TABLE "secret_access_events" ADD COLUMN "errorCode" TEXT;
ALTER TABLE "secret_access_events" ADD COLUMN "runId" TEXT;
CREATE INDEX "secret_access_events_runId_idx" ON "secret_access_events"("runId");
