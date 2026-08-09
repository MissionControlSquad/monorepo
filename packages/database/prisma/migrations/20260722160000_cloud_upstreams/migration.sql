-- CreateTable
CREATE TABLE "cloud_upstreams" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "remoteUrl" TEXT NOT NULL,
    "remoteRef" TEXT NOT NULL DEFAULT 'main',
    "localSha" TEXT,
    "remoteSha" TEXT,
    "ahead" INTEGER NOT NULL DEFAULT 0,
    "behind" INTEGER NOT NULL DEFAULT 0,
    "syncState" TEXT NOT NULL DEFAULT 'unknown',
    "lastError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cloud_upstreams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cloud_upstreams_workspaceId_projectId_name_key" ON "cloud_upstreams"("workspaceId", "projectId", "name");
CREATE INDEX "cloud_upstreams_workspaceId_syncState_idx" ON "cloud_upstreams"("workspaceId", "syncState");
