-- CreateTable
CREATE TABLE "adapter_plugins" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "displayName" TEXT,
    "base" TEXT NOT NULL,
    "template" JSONB NOT NULL,
    "models" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportsModel" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adapter_plugins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "adapter_plugins_workspaceId_key_key" ON "adapter_plugins"("workspaceId", "key");
CREATE INDEX "adapter_plugins_workspaceId_enabled_idx" ON "adapter_plugins"("workspaceId", "enabled");
