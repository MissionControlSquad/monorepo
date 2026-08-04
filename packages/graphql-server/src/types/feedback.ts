import { builder } from "../builder";

// Feedback (parity #60-62): thumbs-up/down + optional (redacted) comment on a target.
builder.prismaObject("Feedback", {
  fields: (t) => ({
    id: t.exposeID("id"),
    workspaceId: t.exposeString("workspaceId"),
    targetType: t.exposeString("targetType"),
    targetId: t.exposeString("targetId", { nullable: true }),
    rating: t.exposeString("rating"),
    comment: t.exposeString("comment", { nullable: true }),
    submittedByProfileId: t.exposeString("submittedByProfileId", { nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
