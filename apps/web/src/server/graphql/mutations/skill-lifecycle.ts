import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import {
  resetSkillToOrigin,
  importSkillPackage,
  importSkillFromSource,
  importFromCatalog,
  reassignSkillFork,
  importSkillFromProjectScan,
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
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
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
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return importSkillPackage({
        workspaceId: tn.workspaceId,
        files: args.files.map((f) => ({ path: f.path, content: f.content })),
        sourceRef: args.sourceRef ?? null,
        createdByProfileId: tn.userId,
      });
    },
  }),
);

// Domain 5 real-import resolvers: install a skill from an external source spec - a GitHub single file
// (URL/owner-repo), a GitHub folder bundle (/tree/ → SKILL.md + siblings), a raw http(s) URL, a
// skills.sh registry ref (skillsh:<name>), or an allow-listed local path - or the app-shipped catalog.
// Admin-gated (fetches remote content into the workspace) + policy-checked (`import`).
builder.mutationField("importSkillFromSource", (t) =>
  t.prismaField({
    type: "Skill",
    args: { source: t.arg.string({ required: true }) },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tn = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
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
      const tn = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      await assertSkillAction(tn.workspaceId, "import", { role: tn.role });
      return importFromCatalog({
        workspaceId: tn.workspaceId,
        ref: args.ref,
        createdByProfileId: tn.userId,
      });
    },
  }),
);

// §3 fork depth: reassign a fork's origin (repoint lineage + re-pin the diverged baseline). Member+,
// policy-checked as an edit of the fork.
builder.mutationField("reassignSkillFork", (t) =>
  t.prismaField({
    type: "Skill",
    args: {
      skillId: t.arg.string({ required: true }),
      newOriginId: t.arg.string({ required: true }),
    },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      await assertSkillAction(tn.workspaceId, "edit", { role: tn.role }, { skillId: args.skillId });
      return reassignSkillFork(tn.workspaceId, args.skillId, args.newOriginId);
    },
  }),
);

// §3 project-workspace scan: import a skill discovered by scanning a project workspace's checked-out
// files. Admin-gated (reads the workspace repo) + policy-checked (`import`). `dir` selects a bundle from
// the picker; omit it to import the first-found bundle.
builder.mutationField("importSkillFromProjectScan", (t) =>
  t.prismaField({
    type: "Skill",
    args: { projectWorkspaceId: t.arg.string({ required: true }), dir: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tn = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      await assertSkillAction(tn.workspaceId, "import", { role: tn.role });
      return importSkillFromProjectScan({
        workspaceId: tn.workspaceId,
        projectWorkspaceId: args.projectWorkspaceId,
        dir: args.dir ?? null,
        createdByProfileId: tn.userId,
      });
    },
  }),
);
