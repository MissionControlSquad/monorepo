import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { addSkillComment, deleteSkillComment } from "@/server/services/skill-comments";

builder.mutationField("addSkillComment", (t) =>
  t.prismaField({ type: "SkillComment",
    args: { skillId: t.arg.string({ required: true }), body: t.arg.string({ required: true }), parentCommentId: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => { await requireFeature(FLAG_KEYS.SKILLS_TEAMS); const tn = requireRole(ctx, "member");
      return addSkillComment({ workspaceId: tn.workspaceId, skillId: args.skillId, body: args.body, parentCommentId: args.parentCommentId ?? null, authorProfileId: tn.userId }); } }),
);
builder.mutationField("deleteSkillComment", (t) =>
  t.field({ type: "Boolean", args: { id: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => { await requireFeature(FLAG_KEYS.SKILLS_TEAMS); const tn = requireRole(ctx, "member"); return deleteSkillComment(tn.workspaceId, args.id); } }),
);
