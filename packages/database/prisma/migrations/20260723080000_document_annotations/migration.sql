-- AlterTable
ALTER TABLE "documents" ADD COLUMN "lockedByProfileId" TEXT,
    ADD COLUMN "lockedAt" TIMESTAMP(3),
    ADD COLUMN "lockExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "document_annotation_threads" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "suffix" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "authorProfileId" TEXT,
    "authorAgentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_annotation_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_annotation_comments" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorProfileId" TEXT,
    "authorAgentId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_annotation_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_annotation_threads_documentId_status_idx" ON "document_annotation_threads"("documentId", "status");
CREATE INDEX "document_annotation_comments_threadId_createdAt_idx" ON "document_annotation_comments"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "document_annotation_comments" ADD CONSTRAINT "document_annotation_comments_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "document_annotation_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
