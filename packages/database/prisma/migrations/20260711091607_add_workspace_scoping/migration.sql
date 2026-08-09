-- Epic #1 (buildbase tenancy): add workspaceId to domain roots (D5). Additive, nullable, no FK.
ALTER TABLE "projects"  ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "agents"    ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "cloud_vms" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "channels"  ADD COLUMN "workspaceId" TEXT;

CREATE INDEX "projects_workspaceId_idx"  ON "projects"("workspaceId");
CREATE INDEX "agents_workspaceId_idx"    ON "agents"("workspaceId");
CREATE INDEX "cloud_vms_workspaceId_idx" ON "cloud_vms"("workspaceId");
CREATE INDEX "channels_workspaceId_idx"  ON "channels"("workspaceId");

-- Backfill existing rows to the default workspace (single-tenant install).
-- Replace 'ws_default' with the bootstrapped buildbase workspace id when auth is wired.
UPDATE "projects"  SET "workspaceId" = 'ws_default' WHERE "workspaceId" IS NULL;
UPDATE "agents"    SET "workspaceId" = 'ws_default' WHERE "workspaceId" IS NULL;
UPDATE "cloud_vms" SET "workspaceId" = 'ws_default' WHERE "workspaceId" IS NULL;
UPDATE "channels"  SET "workspaceId" = 'ws_default' WHERE "workspaceId" IS NULL;
