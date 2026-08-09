-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT NOT NULL,
    "ownerType" TEXT,
    "ownerId" TEXT,
    "metadata" JSONB,
    "uploadedByProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assets_workspaceId_ownerType_ownerId_idx" ON "assets"("workspaceId", "ownerType", "ownerId");
CREATE INDEX "assets_workspaceId_kind_createdAt_idx" ON "assets"("workspaceId", "kind", "createdAt");
