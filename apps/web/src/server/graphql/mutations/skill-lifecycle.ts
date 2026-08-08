import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import {
  resetSkillToOrigin,
  importSkillPackage,
  importSkillFromSource,
  importFromCatalog,
} from "@/server/services/skills";
import { assertSkillAction } from "@/server/services/skill-policy";

const SkillFileInput = builder.inputType("SkillFileInput", {
  fields: (t) => ({ path: t.string({ required: true }), content: t.string({ required: true }) }),
});
builder.mutationField("resetSkillToOrigin", (t) =>
  t.prismaField({
    type: "Skill",
    args: { skillId: t.arg.string({ required: true }) },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tn = requireRole(ctx, "member");
      return resetSkillToOrigin(tn.workspaceId, args.skillId, tn.userId);
    },
  }),
);
builder.mutationField("importSkillPackage", (t) =>
  t.prismaField({
    type: "Skill",
    args: { files: t.arg({ type: [SkillFileInput], required: true }), sourceRef: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tn = requireRole(ctx, "member");
      return importSkillPackage({
        workspaceId: tn.workspaceId,
        files: args.files.map((f) => ({ path: f.path, content: f.content })),
        sourceRef: args.sourceRef ?? null,
        createdByProfileId: tn.userId,
      });
    },
  }),
);

// Domain 5 real-import resolvers: install a skill from an external source spec (GitHub URL/owner-repo,
// a raw http(s) URL) or the app-shipped catalog. Admin-gated (fetches remote content into the
// workspace) + policy-checked (`import`).
builder.mutationField("importSkillFromSource", (t) =>
  t.prismaField({
    type: "Skill",
    args: { source: t.arg.string({ required: true }) },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tn = requireRole(ctx, "admin");
      await assertSkillAction(tn.workspaceId, "import", { role: tn.role });
      return importSkillFromSource({
        workspaceId: tn.workspaceId,
        source: args.source,
        createdByProfileId: tn.userId,
      });
    },
  }),
);

builder.mutationField("importSkillFromCatalog", (t) =>
  t.prismaField({
    type: "Skill",
    args: { ref: t.arg.string({ required: true }) },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tn = requireRole(ctx, "admin");
      await assertSkillAction(tn.workspaceId, "import", { role: tn.role });
      return importFromCatalog({
        workspaceId: tn.workspaceId,
        ref: args.ref,
        createdByProfileId: tn.userId,
      });
    },
  }),
);
