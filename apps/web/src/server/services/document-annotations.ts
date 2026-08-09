import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { DocumentAnnotationThread, DocumentAnnotationComment } from "@agentcenter/database";
import { makeAnchor, remapOpenThreadsForDocument, type AnchorSpec } from "@agentcenter/utils";

// Document annotation threads + cooperative locks (parity Domain-8 §2.5 / G5). Threads anchor to a text
// span and re-anchor across revisions (pure remap in @agentcenter/utils); the advisory lock lets one
// editor hold the doc without a hard mutex, expiring so a crash doesn't strand it. Workspace-scoped via
// the document.

const LOCK_TTL_MS = 5 * 60_000;

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

async function documentContent(documentId: string): Promise<string> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { content: true },
  });
  if (!doc) badRequest("Document not found");
  return doc.content ?? "";
}

/** Open a thread anchored to a [startOffset,endOffset) span of the document's current content. */
export async function createAnnotationThread(input: {
  documentId: string;
  startOffset: number;
  endOffset: number;
  authorProfileId?: string | null;
  authorAgentId?: string | null;
}): Promise<DocumentAnnotationThread> {
  const content = await documentContent(input.documentId);
  if (
    input.startOffset < 0 ||
    input.endOffset > content.length ||
    input.startOffset >= input.endOffset
  )
    badRequest("invalid annotation range");
  const anchor = makeAnchor(content, input.startOffset, input.endOffset);
  return prisma.documentAnnotationThread.create({
    data: {
      documentId: input.documentId,
      quote: anchor.quote,
      prefix: anchor.prefix,
      suffix: anchor.suffix,
      startOffset: anchor.startOffset,
      endOffset: anchor.endOffset,
      authorProfileId: input.authorProfileId ?? null,
      authorAgentId: input.authorAgentId ?? null,
    },
  });
}

export async function addAnnotationComment(input: {
  threadId: string;
  body: string;
  authorProfileId?: string | null;
  authorAgentId?: string | null;
}): Promise<DocumentAnnotationComment> {
  if (!input.body?.trim()) badRequest("comment body is required");
  const thread = await prisma.documentAnnotationThread.findUnique({
    where: { id: input.threadId },
    select: { id: true },
  });
  if (!thread) badRequest("Thread not found");
  return prisma.documentAnnotationComment.create({
    data: {
      threadId: input.threadId,
      body: input.body.slice(0, 8_000),
      authorProfileId: input.authorProfileId ?? null,
      authorAgentId: input.authorAgentId ?? null,
    },
  });
}

export function listAnnotationThreads(
  documentId: string,
  opts: { includeResolved?: boolean } = {},
): Promise<DocumentAnnotationThread[]> {
  return prisma.documentAnnotationThread.findMany({
    where: { documentId, ...(opts.includeResolved ? {} : { status: { not: "resolved" } }) },
    orderBy: { startOffset: "asc" },
    include: { comments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" } } },
  });
}

export async function resolveAnnotationThread(threadId: string): Promise<boolean> {
  const { count } = await prisma.documentAnnotationThread.updateMany({
    where: { id: threadId },
    data: { status: "resolved" },
  });
  return count > 0;
}

/**
 * Re-anchor every open thread onto a new document revision (call after the content is updated). Each
 * thread's offsets + confidence are updated; a thread whose anchor can't be found is marked `orphaned`.
 * Returns a summary. The pure remap does the matching.
 */
export async function reanchorDocumentThreads(
  documentId: string,
  newText: string,
): Promise<{ remapped: number; orphaned: number }> {
  const threads = await prisma.documentAnnotationThread.findMany({
    where: { documentId, status: "open" },
  });
  const specs = threads.map((t) => ({
    id: t.id,
    anchor: {
      quote: t.quote,
      prefix: t.prefix,
      suffix: t.suffix,
      startOffset: t.startOffset,
      endOffset: t.endOffset,
    } as AnchorSpec,
  }));
  const remaps = remapOpenThreadsForDocument(newText, specs);

  let remapped = 0;
  let orphaned = 0;
  for (const r of remaps) {
    if (r.result) {
      await prisma.documentAnnotationThread.update({
        where: { id: r.id },
        data: {
          startOffset: r.result.startOffset,
          endOffset: r.result.endOffset,
          quote: r.result.quote,
          confidence: r.result.confidence,
        },
      });
      remapped++;
    } else {
      await prisma.documentAnnotationThread.update({
        where: { id: r.id },
        data: { status: "orphaned", confidence: 0 },
      });
      orphaned++;
    }
  }
  return { remapped, orphaned };
}

// ── Cooperative (advisory) lock ───────────────────────────────────────────────

export interface LockState {
  acquired: boolean;
  heldByProfileId: string | null;
  expiresAt: Date | null;
}

/** Acquire (or refresh) the advisory edit lock. Fails if another holder's lock is still live. */
export async function acquireDocumentLock(
  documentId: string,
  profileId: string,
  ttlMs = LOCK_TTL_MS,
): Promise<LockState> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    select: { lockedByProfileId: true, lockExpiresAt: true },
  });
  if (!doc) badRequest("Document not found");

  const now = Date.now();
  const live = doc.lockExpiresAt && doc.lockExpiresAt.getTime() > now;
  if (live && doc.lockedByProfileId && doc.lockedByProfileId !== profileId) {
    return {
      acquired: false,
      heldByProfileId: doc.lockedByProfileId,
      expiresAt: doc.lockExpiresAt,
    };
  }
  const expiresAt = new Date(now + ttlMs);
  await prisma.document.update({
    where: { id: documentId },
    data: { lockedByProfileId: profileId, lockedAt: new Date(), lockExpiresAt: expiresAt },
  });
  return { acquired: true, heldByProfileId: profileId, expiresAt };
}

/** Release the lock (only the holder may). Returns true if released. */
export async function releaseDocumentLock(documentId: string, profileId: string): Promise<boolean> {
  const { count } = await prisma.document.updateMany({
    where: { id: documentId, lockedByProfileId: profileId },
    data: { lockedByProfileId: null, lockedAt: null, lockExpiresAt: null },
  });
  return count > 0;
}
