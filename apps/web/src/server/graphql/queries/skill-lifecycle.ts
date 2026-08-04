import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { computeSkillUpdateStatus } from "@/server/services/skills";

const SkillUpdateStatus = builder.simpleObject("SkillUpdateStatus", {
  fields: (t) => ({ state: t.string(), originVersion: t.int({ nullable: true }), latestVersion: t.int({ nullable: true }) }),
});
builder.queryField("skillUpdateStatus", (t) =>
  t.field({ type: SkillUpdateStatus, args: { skillId: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => { await requireFeature(FLAG_KEYS.SKILLS_TEAMS); const tn = requireRole(ctx, "member"); return computeSkillUpdateStatus(tn.workspaceId, args.skillId); } }),
);
