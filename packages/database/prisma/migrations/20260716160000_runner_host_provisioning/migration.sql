-- Track provisioning provenance on RunnerHost so a provisioned VM can be torn down on delete
-- (instead of orphaning it on the customer's cloud account). Additive + nullable — safe.
ALTER TABLE "runner_hosts" ADD COLUMN "provider" TEXT;
ALTER TABLE "runner_hosts" ADD COLUMN "externalServerId" TEXT;
