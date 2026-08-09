-- Paperclip parity (document-annotations): human review comments on project docs.
CREATE TABLE "project_doc_comments" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "quote" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "authorProfileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_doc_comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "project_doc_comments_docId_idx" ON "project_doc_comments"("docId");
ALTER TABLE "project_doc_comments" ADD CONSTRAINT "project_doc_comments_docId_fkey" FOREIGN KEY ("docId") REFERENCES "project_docs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
