-- Parity §3.12: generic revision history for the Document entity (analogue of ProjectDocRevision /
-- RoutineRevision). One additive table; starts empty (a snapshot is taken on the next update). Author
-- attribution by plain id (no FK, D5). Revision number is unique per-document. Cascades from the doc.
CREATE TABLE "document_revisions" (
  "id"              TEXT NOT NULL,
  "documentId"      TEXT NOT NULL,
  "revision"        INTEGER NOT NULL,
  "title"           TEXT NOT NULL,
  "content"         TEXT NOT NULL,
  "authorProfileId" TEXT,
  "authorAgentId"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_revisions_documentId_revision_key" ON "document_revisions"("documentId", "revision");
CREATE INDEX "document_revisions_documentId_createdAt_idx" ON "document_revisions"("documentId", "createdAt");

ALTER TABLE "document_revisions"
  ADD CONSTRAINT "document_revisions_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
