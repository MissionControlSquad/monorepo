import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  createAnnotationThread,
  addAnnotationComment,
} from "../../src/server/services/document-annotations";
import { reviewTaskByHuman } from "../../src/server/services/review";

/**
 * Work-items §3 residuals.
 *   Item 1 — an annotation comment mirrors into its document's task as a linked Message (both ways).
 *   Item 2 — a status-change auto-post carries structured `presentation` metadata (plain posts don't).
 */

const CONTENT = "The quick brown fox jumps over the lazy dog.";

describe("work-item residuals — annotation ↔ comment mirroring (Item 1)", () => {
  let authorProfileId = "";
  let taskId = "";
  let documentId = "";

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `TRUNCATE TABLE messages, document_annotation_comments, document_annotation_threads, documents, tasks, profiles CASCADE`,
    );
    const profile = await prisma.profile.create({
      data: { kind: "human", displayName: "Annotator" },
    });
    authorProfileId = profile.id;
    const task = await prisma.task.create({
      data: { title: "Doc task", description: "d", status: "assigned" },
    });
    taskId = task.id;
    const doc = await prisma.document.create({
      data: { title: "spec", content: CONTENT, type: "note", taskId },
    });
    documentId = doc.id;
  });

  it("mirrors an annotation comment into the task timeline, linked both ways", async () => {
    const thread = await createAnnotationThread({ documentId, startOffset: 4, endOffset: 15 });
    expect(thread.quote).toBe("quick brown");

    const comment = await addAnnotationComment({
      threadId: thread.id,
      body: "please reword",
      authorProfileId,
      mirrorToTask: true,
    });

    // A linked Message exists on the document's task…
    const messages = await prisma.message.findMany({ where: { taskId } });
    expect(messages).toHaveLength(1);
    const mirrored = messages[0];
    // …and it carries the annotation link back to the originating comment (Message → comment).
    expect(mirrored.annotationCommentId).toBe(comment.id);
    expect(mirrored.fromProfileId).toBe(authorProfileId);
    expect(mirrored.content).toContain("quick brown"); // the annotated quote
    expect(mirrored.content).toContain("please reword"); // the comment body

    // The comment resolves its mirrored Message (comment → Message), completing the round-trip.
    const withMirror = await prisma.documentAnnotationComment.findUniqueOrThrow({
      where: { id: comment.id },
      include: { mirroredMessage: true },
    });
    expect(withMirror.mirroredMessage?.id).toBe(mirrored.id);
  });

  it("does not mirror when mirroring is disabled", async () => {
    const thread = await createAnnotationThread({ documentId, startOffset: 4, endOffset: 15 });
    await addAnnotationComment({
      threadId: thread.id,
      body: "no mirror",
      authorProfileId,
      mirrorToTask: false,
    });
    expect(await prisma.message.count({ where: { taskId } })).toBe(0);
  });

  it("no-ops for a document not scoped to a task", async () => {
    const orphanDoc = await prisma.document.create({
      data: { title: "loose", content: CONTENT, type: "note" }, // no taskId
    });
    const thread = await createAnnotationThread({
      documentId: orphanDoc.id,
      startOffset: 4,
      endOffset: 15,
    });
    const comment = await addAnnotationComment({
      threadId: thread.id,
      body: "orphan",
      authorProfileId,
      mirrorToTask: true,
    });
    expect(await prisma.message.count()).toBe(0);
    const c = await prisma.documentAnnotationComment.findUniqueOrThrow({
      where: { id: comment.id },
      include: { mirroredMessage: true },
    });
    expect(c.mirroredMessage).toBeNull();
  });
});

describe("work-item residuals — rich comment presentation (Item 2)", () => {
  let reviewerProfileId = "";

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE messages, tasks, profiles CASCADE`);
    const p = await prisma.profile.create({ data: { kind: "human", displayName: "Reviewer" } });
    reviewerProfileId = p.id;
  });

  it("an approval auto-post carries a success status-change presentation", async () => {
    const task = await prisma.task.create({
      data: { title: "Ship", description: "d", status: "review" },
    });
    await reviewTaskByHuman({
      taskId: task.id,
      reviewerProfileId,
      reviewerName: "Reviewer",
      decision: "approve",
      note: "LGTM",
    });
    const msg = await prisma.message.findFirstOrThrow({ where: { taskId: task.id } });
    expect(msg.presentation).toMatchObject({
      kind: "status_change",
      tone: "success",
      title: "Task approved",
      toStatus: "done",
    });
  });

  it("a request-changes auto-post carries a warning status-change presentation", async () => {
    const task = await prisma.task.create({
      data: { title: "Redo", description: "d", status: "review" },
    });
    await reviewTaskByHuman({
      taskId: task.id,
      reviewerProfileId,
      reviewerName: "Reviewer",
      decision: "request_changes",
      note: "tighten copy",
    });
    const msg = await prisma.message.findFirstOrThrow({ where: { taskId: task.id } });
    expect(msg.presentation).toMatchObject({
      kind: "status_change",
      tone: "warning",
      detail: "tighten copy",
    });
  });

  it("a plain message has no presentation (fallback path unaffected)", async () => {
    const task = await prisma.task.create({
      data: { title: "Chat", description: "d", status: "assigned" },
    });
    const plain = await prisma.message.create({
      data: { taskId: task.id, fromProfileId: reviewerProfileId, content: "just a comment" },
    });
    expect(plain.presentation).toBeNull();
  });
});
