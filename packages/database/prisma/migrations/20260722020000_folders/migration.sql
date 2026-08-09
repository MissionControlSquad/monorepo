-- Folders (parity #64): nestable organization tree + a generic item-placement join.
CREATE TABLE "folders" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentFolderId" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdByProfileId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "folders_workspaceId_parentFolderId_idx" ON "folders"("workspaceId", "parentFolderId");
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "folder_items" (
  "id" TEXT NOT NULL,
  "folderId" TEXT NOT NULL,
  "itemType" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "folder_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "folder_items_folderId_itemType_itemId_key" ON "folder_items"("folderId", "itemType", "itemId");
CREATE INDEX "folder_items_itemType_itemId_idx" ON "folder_items"("itemType", "itemId");
ALTER TABLE "folder_items" ADD CONSTRAINT "folder_items_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
