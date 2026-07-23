import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  createAnnotationThread,
  addAnnotationComment,
  listAnnotationThreads,
  resolveAnnotationThread,
  reanchorDocumentThreads,
  acquireDocumentLock,
  releaseDocumentLock,
} from "../../src/server/services/document-annotations";

// Parity Domain-8 §2.5 / G5 — document annotations + re-anchoring + cooperative locks.
const CONTENT = "The quick brown fox jumps over the lazy dog.";
let docId = "";

beforeEach(async () => {
  await prisma.document.deleteMany({ where: { title: "anno-doc" } });
  const doc = await prisma.document.create({
    data: { title: "anno-doc", content: CONTENT, type: "note" },
  });
  docId = doc.id;
});

describe("document annotations (#G5)", () => {
  it("creates an anchored thread with comments and resolves it", async () => {
    const thread = await createAnnotationThread({
      documentId: docId,
      startOffset: 4,
      endOffset: 15,
    });
    expect(thread.quote).toBe("quick brown");
    await addAnnotationComment({ threadId: thread.id, body: "reword this" });
    const open = await listAnnotationThreads(docId);
    expect(open).toHaveLength(1);
    expect((open[0] as unknown as { comments: unknown[] }).comments).toHaveLength(1);

    expect(await resolveAnnotationThread(thread.id)).toBe(true);
    expect(await listAnnotationThreads(docId)).toHaveLength(0); // resolved hidden by default
  });

  it("re-anchors threads across a revision and orphans a lost anchor", async () => {
    const keep = await createAnnotationThread({
      documentId: docId,
      startOffset: 16,
      endOffset: 19,
    }); // "fox"
    const lose = await createAnnotationThread({
      documentId: docId,
      startOffset: 35,
      endOffset: 39,
    }); // "lazy"

    // new revision: insert a prefix (shifts "fox") and delete "lazy dog"
    const newText = "Note: The quick brown fox jumps over the cat.";
    const summary = await reanchorDocumentThreads(docId, newText);
    expect(summary.remapped).toBe(1);
    expect(summary.orphaned).toBe(1);

    const keptThread = await prisma.documentAnnotationThread.findUnique({ where: { id: keep.id } });
    expect(newText.slice(keptThread!.startOffset, keptThread!.endOffset)).toBe("fox");
    const lostThread = await prisma.documentAnnotationThread.findUnique({ where: { id: lose.id } });
    expect(lostThread!.status).toBe("orphaned");
  });

  it("cooperative lock: one holder at a time, expiry, holder-only release", async () => {
    const a = await acquireDocumentLock(docId, "alice");
    expect(a.acquired).toBe(true);
    // bob can't take a live lock
    expect((await acquireDocumentLock(docId, "bob")).acquired).toBe(false);
    // non-holder can't release
    expect(await releaseDocumentLock(docId, "bob")).toBe(false);
    // holder releases → bob can take it
    expect(await releaseDocumentLock(docId, "alice")).toBe(true);
    expect((await acquireDocumentLock(docId, "bob")).acquired).toBe(true);
  });
});
