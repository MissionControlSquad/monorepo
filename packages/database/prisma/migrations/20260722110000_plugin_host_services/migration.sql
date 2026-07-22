-- CreateTable
CREATE TABLE "plugin_host_services" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'declared',
    "endpoint" TEXT,
    "config" JSONB,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugin_host_services_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plugin_host_services_workspaceId_pluginId_serviceKey_key" ON "plugin_host_services"("workspaceId", "pluginId", "serviceKey");
CREATE INDEX "plugin_host_services_workspaceId_kind_status_idx" ON "plugin_host_services"("workspaceId", "kind", "status");
