-- Epic #6: plugin registry. 1 table, 2 enums.

CREATE TYPE "PluginCategory" AS ENUM ('connector', 'workspace', 'automation', 'ui');
CREATE TYPE "PluginStatus" AS ENUM ('installed', 'disabled', 'error');

CREATE TABLE "plugins" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "pluginId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "description" TEXT,
  "category" "PluginCategory" NOT NULL,
  "capabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "manifest" JSONB NOT NULL,
  "status" "PluginStatus" NOT NULL DEFAULT 'installed',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "installedByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "plugins_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "plugins_workspaceId_pluginId_key" ON "plugins"("workspaceId", "pluginId");
CREATE INDEX "plugins_workspaceId_status_idx" ON "plugins"("workspaceId", "status");
