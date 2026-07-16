-- Retire the managed CloudVM subsystem — all infrastructure is now bring-your-own (RunnerHost).
-- A provisioned Hetzner VM is registered as a RunnerHost (see hetzner-provision.ts); there is no
-- separate CloudVM model. Destructive by design: drops the CloudVM tables, the Agent→CloudVM link,
-- and the Deployment* enums. Safe because the managed path had no users/rows (it was gated off).
--
-- Intentionally NOT touched: the unused `cloud_vm` value on enum "RunnerTargetKind" and the `cloudVM`
-- value on enum "HostingType" are kept — dropping a Postgres enum value requires a fragile
-- type-recreate, and no code targets either value anymore.

-- 1. Sever the Agent → CloudVM relation.
ALTER TABLE "agents" DROP CONSTRAINT IF EXISTS "agents_cloudVmId_fkey";
DROP INDEX IF EXISTS "agents_cloudVmId_idx";
ALTER TABLE "agents" DROP COLUMN IF EXISTS "cloudVmId";

-- 2. Drop the CloudVM tables (children first to respect FKs).
DROP TABLE IF EXISTS "cloud_vm_logs";
DROP TABLE IF EXISTS "cloud_vm_usage";
DROP TABLE IF EXISTS "cloud_vms";

-- 3. Drop the now-unused deployment enums.
DROP TYPE IF EXISTS "DeploymentStatus";
DROP TYPE IF EXISTS "DeploymentProvider";
