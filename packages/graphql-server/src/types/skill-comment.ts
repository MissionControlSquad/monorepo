import { builder } from "../builder";
builder.prismaObject("SkillComment", {
  fields: (t) => ({
    id: t.exposeID("id"),
    skillId: t.exposeString("skillId"),
    parentCommentId: t.exposeString("parentCommentId", { nullable: true }),
    authorAgentId: t.exposeString("authorAgentId", { nullable: true }),
    authorProfileId: t.exposeString("authorProfileId", { nullable: true }),
    body: t.exposeString("body"),
    deletedAt: t.expose("deletedAt", { type: "DateTime", nullable: true }),
    createdAt: t.expose("createdAt", { type: "DateTime" }),
  }),
});
