import { prisma } from "@/server/prisma";
import type { DocumentAnnotationThread, DocumentAnnotationComment } from "@agentcenter/database";
import { makeAnchor, remapOpenThreadsForDocument, type AnchorSpec } from "@agentcenter/utils";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { badRequest } from "./service-errors";

// Document annotation threads + cooperative locks (parity Domain-8 §2.5 / G5). Threads anchor to a text
// span and re-anchor across revisions (pure remap in @agentcenter/utils); the advisory lock lets one
// editor hold the doc without a hard mutex, expiring so a crash doesn't strand it. Workspace-scoped via
// the document.

const LOCK_TTL_MS = 5 * 60_000;

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
  /**
   * Work-items §3 Item 1 — mirror this annotation comment into the annotated document's task as a
   * timeline Message (linked both ways). Best-effort: a no-op when the document isn't task-scoped or no
   * author profile can be resolved. Defaults on; the resolver passes `false` when ANNOTATIONS is off.
   */
  mirrorToTask?: boolean;
}): Promise<DocumentAnnotationComment> {
  if (!input.body?.trim()) badRequest("comment body is required");
  const thread = await prisma.documentAnnotationThread.findUnique({
    where: { id: input.threadId },
    select: { id: true, quote: true, documentId: true, startOffset: true, endOffset: true },
  });
  if (!thread) badRequest("Thread not found");
  const body = input.body.slice(0, 8_000);
  const comment = await prisma.documentAnnotationComment.create({
    data: {
      threadId: input.threadId,
      body,
      authorProfileId: input.authorProfileId ?? null,
      authorAgentId: input.authorAgentId ?? null,
    },
  });

  if (input.mirrorToTask !== false) {
    await mirrorAnnotationCommentToTask({
      comment,
      thread: thread!,
      authorProfileId: input.authorProfileId ?? null,
      authorAgentId: input.authorAgentId ?? null,
    }).catch(() => {
      // Mirroring is a surfacing convenience, never a correctness dependency of the annotation write.
    });
  }
  return comment;
}

/**
 * Mirror an annotation comment into its document's task timeline (Work-items §3 Item 1). Creates a task
 * `Message` carrying the annotated quote + comment body and a back-link (`annotationCommentId`) to the
 * originating comment, so the discussion surfaces in the task timeline and can be traced back. No-op
 * (returns null) when the document isn't task-scoped or no author profile can be resolved.
 */
async function mirrorAnnotationCommentToTask(input: {
  comment: Pick<DocumentAnnotationComment, "id" | "body">;
  thread: { quote: string; documentId: string; startOffset: number; endOffset: number };
  authorProfileId: string | null;
  authorAgentId: string | null;
}): Promise<{ messageId: string } | null> {
  const doc = await prisma.document.findUnique({
    where: { id: input.thread.documentId },
    select: { taskId: true, projectId: true },
  });
  if (!doc?.taskId) return null;

  const fromProfileId =
    input.authorProfileId ??
    (input.authorAgentId ? await getOrCreateAgentProfileId(input.authorAgentId) : null);
  if (!fromProfileId) return null;

  const quote =
    input.thread.quote.length > 140 ? `${input.thread.quote.slice(0, 139)}…` : input.thread.quote;
  const content = `> ${quote}\n\n${input.comment.body}`;

  const message = await prisma.message.create({
    data: {
      taskId: doc.taskId,
      fromProfileId,
      projectId: doc.projectId ?? null,
      content: content.slice(0, 8_000),
      annotationCommentId: input.comment.id,
    },
    select: { id: true },
  });
  return { messageId: message.id };
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
