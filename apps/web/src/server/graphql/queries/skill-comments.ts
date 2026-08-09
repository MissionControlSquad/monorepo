import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { listSkillComments } from "@/server/services/skill-comments";

builder.queryField("skillComments", (t) =>
  t.prismaField({ type: ["SkillComment"], args: { skillId: t.arg.string({ required: true }) },
    resolve: async (_q, _r, args, ctx) => { await requireFeature(FLAG_KEYS.SKILLS_TEAMS); const tn = requireRole(ctx, "member"); return listSkillComments(tn.workspaceId, args.skillId); } }),
);
