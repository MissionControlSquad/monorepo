-- CreateTable
CREATE TABLE "plugin_local_folders" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "label" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastLoadedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plugin_local_folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plugin_local_folders_workspaceId_path_key" ON "plugin_local_folders"("workspaceId", "path");
CREATE INDEX "plugin_local_folders_workspaceId_enabled_idx" ON "plugin_local_folders"("workspaceId", "enabled");
