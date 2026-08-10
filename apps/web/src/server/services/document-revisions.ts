/**
 * Parity §3.12 — generic revision history for the `Document` entity (the analogue of
 * ProjectDocRevision / RoutineRevision). Each revision is a content snapshot numbered per-document.
 * We snapshot the resulting state on every update so the timeline is a full version history.
 */
import { prisma } from "@/server/prisma";
import type { DocumentRevision } from "@agentcenter/database";

/** Next monotonic revision number for a document (1-based). */
async function nextRevisionNumber(documentId: string): Promise<number> {
  const last = await prisma.documentRevision.findFirst({
    where: { documentId },
    orderBy: { revision: "desc" },
    select: { revision: true },
  });
  return (last?.revision ?? 0) + 1;
}

/**
 * Snapshot a document's current title+content as a new revision. Called after a document update so
 * each committed version is retained. No-op (returns null) if the document no longer exists.
 */
export async function snapshotDocumentRevision(args: {
  documentId: string;
  authorProfileId?: string | null;
  authorAgentId?: string | null;
}): Promise<DocumentRevision | null> {
  const doc = await prisma.document.findUnique({
    where: { id: args.documentId },
    select: { id: true, title: true, content: true },
  });
  if (!doc) return null;
  const revision = await nextRevisionNumber(args.documentId);
  return prisma.documentRevision.create({
    data: {
      documentId: doc.id,
      revision,
      title: doc.title,
      content: doc.content,
      authorProfileId: args.authorProfileId ?? null,
      authorAgentId: args.authorAgentId ?? null,
    },
  });
}

/** List a document's revisions, newest first. */
export function listDocumentRevisions(documentId: string): Promise<DocumentRevision[]> {
  return prisma.documentRevision.findMany({
    where: { documentId },
    orderBy: { revision: "desc" },
  });
}
