-- CreateTable
CREATE TABLE "external_objects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "state" TEXT,
    "snapshot" JSONB,
    "linkedType" TEXT,
    "linkedId" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_objects_workspaceId_provider_externalId_key" ON "external_objects"("workspaceId", "provider", "externalId");
CREATE INDEX "external_objects_workspaceId_linkedType_linkedId_idx" ON "external_objects"("workspaceId", "linkedType", "linkedId");
