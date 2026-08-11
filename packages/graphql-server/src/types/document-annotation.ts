import { builder } from "../builder";
builder.prismaObject("DocumentAnnotationComment", {
  fields: (t) => ({
    id: t.exposeID("id"), body: t.exposeString("body"),
    threadId: t.exposeString("threadId"),
    authorProfileId: t.exposeString("authorProfileId", { nullable: true }),
    authorAgentId: t.exposeString("authorAgentId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    // Work-items §3 Item 1 — the anchored thread (documentId + quote + offsets for the origin link),
    // and the task Message this comment was mirrored into (both-ways navigation).
    thread: t.relation("thread"),
    mirroredMessage: t.relation("mirroredMessage", { nullable: true }),
  }),
});
builder.prismaObject("DocumentAnnotationThread", {
  fields: (t) => ({
    id: t.exposeID("id"), documentId: t.exposeString("documentId"),
    quote: t.exposeString("quote"), startOffset: t.exposeInt("startOffset"), endOffset: t.exposeInt("endOffset"),
    status: t.exposeString("status"), confidence: t.exposeFloat("confidence"),
    comments: t.relation("comments"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
