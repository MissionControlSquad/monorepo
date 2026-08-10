-- Plugin runtime capability grants (parity #103). Fail-closed enforcement: a plugin's declared
-- capability grants nothing until an admin inserts a row here. Additive-only, no backfill needed
-- (registry-only plugins simply have no grants → every capability-gated action is refused).

-- CreateTable
CREATE TABLE "plugin_grants" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "grantedByProfileId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: one grant row per (workspace, plugin, capability) — re-granting is idempotent.
CREATE UNIQUE INDEX "plugin_grants_workspaceId_pluginId_capability_key" ON "plugin_grants"("workspaceId", "pluginId", "capability");

-- CreateIndex: list a plugin's grants (detail page + runtime resolve).
CREATE INDEX "plugin_grants_workspaceId_pluginId_idx" ON "plugin_grants"("workspaceId", "pluginId");
