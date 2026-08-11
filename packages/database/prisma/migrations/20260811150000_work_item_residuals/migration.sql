-- Work-item residuals (§3 work-items). Two additive, nullable, reversible changes.
--
-- Item 1 — Annotation ↔ comment mirroring. A DocumentAnnotationComment can be mirrored into its
--   document's task as a Message; the Message points back at the originating annotation comment via a
--   nullable, UNIQUE FK (a Message mirrors at most one annotation comment — Paperclip issueCommentId
--   equivalent). ON DELETE SET NULL: deleting the annotation comment un-links the mirror, never cascades
--   into the timeline. Existing rows backfill to NULL (no mirror).
--
-- Item 2 — Rich comment PRESENTATION metadata. A nullable JSONB payload on Message that lets a
--   system-authored comment (run summary, status change, deliverable reference) render a richer card.
--   NULL = plain content (unchanged behaviour, the fallback).
--
-- Rollback:
--   ALTER TABLE "messages" DROP CONSTRAINT "messages_annotationCommentId_fkey";
--   DROP INDEX "messages_annotationCommentId_key";
--   ALTER TABLE "messages" DROP COLUMN "annotationCommentId";
--   ALTER TABLE "messages" DROP COLUMN "presentation";

ALTER TABLE "messages" ADD COLUMN "presentation" JSONB;
ALTER TABLE "messages" ADD COLUMN "annotationCommentId" TEXT;

CREATE UNIQUE INDEX "messages_annotationCommentId_key" ON "messages"("annotationCommentId");

ALTER TABLE "messages" ADD CONSTRAINT "messages_annotationCommentId_fkey" FOREIGN KEY ("annotationCommentId") REFERENCES "document_annotation_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
