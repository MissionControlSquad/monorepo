import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { syncAgentSkills } from "@/server/services/agent-skills-sync";

const SkillEntry = builder.simpleObject("SkillEntry", {
  fields: (t) => ({ skillId: t.string(), state: t.string(), desiredVersion: t.int({ nullable: true }), actualVersion: t.int({ nullable: true }) }),
});
const SkillSnapshot = builder.simpleObject("SkillSnapshot", {
  fields: (t) => ({ agentId: t.string(), adapterType: t.string({ nullable: true }), mode: t.string(), entries: t.field({ type: [SkillEntry] }), warnings: t.stringList() }),
});
const DesiredSkillInput = builder.inputType("DesiredSkillInput", {
  fields: (t) => ({ skillId: t.string({ required: true }), pinnedVersion: t.int() }),
});
builder.mutationField("syncAgentSkills", (t) =>
  t.field({ type: SkillSnapshot,
    args: { agentId: t.arg.string({ required: true }), desiredSkills: t.arg({ type: [DesiredSkillInput], required: true }) },
    resolve: async (_r, args, ctx) => { await requireFeature(FLAG_KEYS.SKILLS_TEAMS); const tn = requireRole(ctx, "admin");
      return syncAgentSkills(tn.workspaceId, args.agentId, args.desiredSkills.map((d) => ({ skillId: d.skillId, pinnedVersion: d.pinnedVersion ?? null }))); } }),
);
