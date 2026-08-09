import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  projectDocComments,
  addProjectDocComment,
  setProjectDocCommentResolved,
  deleteProjectDocComment,
} from "../../src/server/services/project-doc-comments";

// Paperclip parity — review comments on agent-authored project docs.
describe("project doc comments", () => {
  let docId: string;
  beforeAll(async () => {
    const project = await prisma.project.create({ data: { name: "Doc-comments proj" } });
    const doc = await prisma.projectDoc.create({
      data: { projectId: project.id, title: "Spec", content: "# Spec\nbody" },
    });
    docId = doc.id;
  });

  it("adds, lists, resolves and deletes a comment", async () => {
    const c = await addProjectDocComment({
      docId,
      body: "  Please clarify section 2  ",
      quote: "section 2",
    });
    expect(c.body).toBe("Please clarify section 2"); // trimmed
    expect(c.quote).toBe("section 2");
    expect(c.resolved).toBe(false);

    expect((await projectDocComments(docId)).map((x) => x.id)).toContain(c.id);

    const resolved = await setProjectDocCommentResolved(c.id, true);
    expect(resolved.resolved).toBe(true);

    expect(await deleteProjectDocComment(c.id)).toBe(true);
    expect((await projectDocComments(docId)).map((x) => x.id)).not.toContain(c.id);
  });

  it("rejects an empty body and an unknown document", async () => {
    await expect(addProjectDocComment({ docId, body: "   " })).rejects.toThrow(/body is required/);
    await expect(addProjectDocComment({ docId: "nope", body: "hi" })).rejects.toThrow(
      /document not found/,
    );
  });
});
