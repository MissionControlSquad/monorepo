-- CreateTable
CREATE TABLE "plugin_jobs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "scheduledFor" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "schedule" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugin_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_kv" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "namespace" TEXT NOT NULL DEFAULT 'state',
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_kv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_managed_resources" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "externalRef" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_managed_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_tools" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "inputSchema" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugin_tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plugin_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pluginId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plugin_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plugin_jobs_workspaceId_status_scheduledFor_idx" ON "plugin_jobs"("workspaceId", "status", "scheduledFor");
CREATE INDEX "plugin_jobs_workspaceId_pluginId_idx" ON "plugin_jobs"("workspaceId", "pluginId");
CREATE UNIQUE INDEX "plugin_kv_workspaceId_pluginId_namespace_key_key" ON "plugin_kv"("workspaceId", "pluginId", "namespace", "key");
CREATE INDEX "plugin_kv_workspaceId_pluginId_namespace_idx" ON "plugin_kv"("workspaceId", "pluginId", "namespace");
CREATE UNIQUE INDEX "plugin_managed_resources_workspaceId_resourceType_resourceId_key" ON "plugin_managed_resources"("workspaceId", "resourceType", "resourceId");
CREATE INDEX "plugin_managed_resources_workspaceId_pluginId_idx" ON "plugin_managed_resources"("workspaceId", "pluginId");
CREATE UNIQUE INDEX "plugin_tools_workspaceId_toolName_key" ON "plugin_tools"("workspaceId", "toolName");
CREATE INDEX "plugin_tools_workspaceId_pluginId_idx" ON "plugin_tools"("workspaceId", "pluginId");
CREATE INDEX "plugin_logs_workspaceId_pluginId_createdAt_idx" ON "plugin_logs"("workspaceId", "pluginId", "createdAt");
