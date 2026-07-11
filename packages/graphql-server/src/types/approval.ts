import { builder } from "../builder";

// Epic #3: Approval + ApprovalComment (agent-domain governance).
builder.prismaObject("Approval", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    subjectType: t.exposeString("subjectType"),
    subjectId: t.exposeString("subjectId"),
    taskId: t.exposeString("taskId", { nullable: true }),
    status: t.exposeString("status"),
    title: t.exposeString("title"),
    reason: t.exposeString("reason", { nullable: true }),
    decisionNote: t.exposeString("decisionNote", { nullable: true }),
    resubmitCount: t.exposeInt("resubmitCount"),
    requestedBy: t.relation("requestedBy"),
    decidedBy: t.relation("decidedBy", { nullable: true }),
    task: t.relation("task", { nullable: true }),
    comments: t.relation("comments"),
    decidedAt: t.expose("decidedAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
    updatedAt: t.expose("updatedAt", { type: "DateTime" }),
  }),
});

builder.prismaObject("ApprovalComment", {
  fields: (t) => ({
    id: t.exposeID("id"),
    approvalId: t.exposeString("approvalId"),
    body: t.exposeString("body"),
    author: t.relation("author"),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
