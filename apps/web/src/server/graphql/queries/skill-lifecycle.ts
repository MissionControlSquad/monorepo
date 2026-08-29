import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import {
  computeSkillUpdateStatus,
  precheckForkTarget,
  listProjectWorkspaceSkillCandidates,
} from "@/server/services/skills";
import { listCatalogSkills } from "@/server/skill-catalog/manifest";

const SkillUpdateStatus = builder.simpleObject("SkillUpdateStatus", {
  fields: (t) => ({
    state: t.string(),
    originVersion: t.int({ nullable: true }),
    latestVersion: t.int({ nullable: true }),
  }),
});
builder.queryField("skillUpdateStatus", (t) =>
  t.field({
    type: SkillUpdateStatus,
    args: { skillId: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return computeSkillUpdateStatus(tn.workspaceId, args.skillId);
    },
  }),
);

// Domain 5 real-import: the app-shipped skills catalog (curated, content-addressed bundles). Read-only,
// member+. Install one via the `importSkillFromCatalog` mutation.
const CatalogSkillEntry = builder.simpleObject("CatalogSkillEntry", {
  fields: (t) => ({
    id: t.string(),
    key: t.string(),
    name: t.string(),
    description: t.string(),
    category: t.string(),
    tags: t.stringList(),
    trustLevel: t.string(),
    contentHash: t.string(),
    packageName: t.string(),
  }),
});
// §3 fork depth: precheck whether this workspace already forks a given origin (drives the UI warn).
const ForkPrecheckType = builder.simpleObject("ForkPrecheck", {
  fields: (t) => ({
    originId: t.string(),
    hasExistingFork: t.boolean(),
    existingForkId: t.string({ nullable: true }),
    existingForkName: t.string({ nullable: true }),
  }),
});
builder.queryField("forkPrecheck", (t) =>
  t.field({
    type: ForkPrecheckType,
    args: { skillId: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return precheckForkTarget(tn.workspaceId, args.skillId);
    },
  }),
);

// §3 project-workspace scan: discovered skill bundles inside a project workspace's checked-out files.
const ProjectSkillCandidateType = builder.simpleObject("ProjectSkillCandidate", {
  fields: (t) => ({
    dir: t.string(),
    name: t.string(),
    fileCount: t.int(),
    sourceRef: t.string(),
  }),
});
builder.queryField("projectWorkspaceSkillCandidates", (t) =>
  t.field({
    type: [ProjectSkillCandidateType],
    args: { projectWorkspaceId: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tn = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const candidates = await listProjectWorkspaceSkillCandidates({
        workspaceId: tn.workspaceId,
        projectWorkspaceId: args.projectWorkspaceId,
      });
      return candidates.map((c) => ({
        dir: c.dir,
        name: c.name,
        fileCount: c.files.length,
        sourceRef: c.provenance.sourceRef,
      }));
    },
  }),
);

builder.queryField("skillCatalogPackages", (t) =>
  t.field({
    type: [CatalogSkillEntry],
    resolve: async (_r, _args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listCatalogSkills().map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        description: s.description,
        category: s.category,
        tags: s.tags,
        trustLevel: s.trustLevel,
        contentHash: s.contentHash,
        packageName: s.packageName,
      }));
    },
  }),
);
