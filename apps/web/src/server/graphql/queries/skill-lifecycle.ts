import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { computeSkillUpdateStatus } from "@/server/services/skills";
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
      const tn = requireRole(ctx, "member");
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
builder.queryField("skillCatalogPackages", (t) =>
  t.field({
    type: [CatalogSkillEntry],
    resolve: async (_r, _args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, "member");
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
