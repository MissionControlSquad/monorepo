import { builder } from "../builder";

// Epic #15: board concierge chat — a standing per-workspace conversation.
builder.prismaObject("BoardThread", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    title: t.exposeString("title"),
    messages: t.relation("messages", { query: { orderBy: { createdAt: "asc" } } }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("BoardMessage", {
  fields: (t) => ({
    id: t.exposeID("id"),
    threadId: t.exposeString("threadId"),
    role: t.exposeString("role"),
    body: t.exposeString("body"),
    authorId: t.exposeString("authorId", { nullable: true }),
    feedbackScore: t.exposeInt("feedbackScore", { nullable: true }),
    feedbackReason: t.exposeString("feedbackReason", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
