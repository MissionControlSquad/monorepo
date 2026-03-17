-- Add "file" to DocumentType enum
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'file';

-- Make createdById nullable (humans have no agent ID)
ALTER TABLE "documents" ALTER COLUMN "createdById" DROP NOT NULL;

-- Add file-related fields to Document
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "createdByProfileId" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "storageKey" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER;

-- Add foreign key for createdByProfileId -> profiles(id)
ALTER TABLE "documents"
  ADD CONSTRAINT "documents_createdByProfileId_fkey"
  FOREIGN KEY ("createdByProfileId") REFERENCES "profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
