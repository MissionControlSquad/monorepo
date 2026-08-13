import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import {
  FLAG_KEYS,
  isCollisionStrategy,
  lintSkill,
  isSkillAction,
  auditSkill,
} from "@agentcenter/utils";
import type { CollisionStrategy } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { previewTeamInstall, listTeamCatalog } from "@/server/services/teams";
import { getSkillPolicy, evaluateSkillAction } from "@/server/services/skill-policy";

const SkillLintFinding = builder.simpleObject("SkillLintFinding", {
  fields: (t) => ({
    level: t.string(),
    path: t.string({ nullable: true }),
    message: t.string(),
  }),
});

const TeamInstallPlanItemType = builder.simpleObject("TeamInstallPlanItem", {
  fields: (t) => ({
    member: t.string(),
    action: t.string(),
    agentName: t.string(),
  }),
});

// Shipped markdown teams catalog (Domain 14 — teams-catalog parity). Read-only entries the UI browses
// then installs via `installTeamFromCatalog`.
const CatalogTeamRoleType = builder.simpleObject("CatalogTeamRole", {
  fields: (t) => ({ name: t.string(), role: t.string() }),
});
const CatalogTeamType = builder.simpleObject("CatalogTeam", {
  fields: (t) => ({
    id: t.string(),
    slug: t.string(),
    key: t.string(),
    name: t.string(),
    description: t.string(),
    tagline: t.string(),
    icon: t.string({ nullable: true }),
    author: t.string({ nullable: true }),
    tags: t.stringList(),
    roleCount: t.int(),
    roles: t.field({ type: [CatalogTeamRoleType] }),
    sourceRef: t.string(),
  }),
});

// Epic #10: skills + teams reads — SKILLS_TEAMS-gated, workspace-scoped, member+.
builder.queryField("skills", (t) =>
  t.prismaField({
    type: ["Skill"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.skill.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { updatedAt: "desc" },
      });
    },
  }),
);

builder.queryField("skill", (t) =>
  t.prismaField({
    type: "Skill",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.skill.findFirst({ ...query, where: scoped(ctx, { id: args.id }) });
    },
  }),
);

builder.queryField("skillVersions", (t) =>
  t.prismaField({
    type: ["SkillVersion"],
    args: { skillId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const s = await ctx.prisma.skill.findFirst({
        where: scoped(ctx, { id: args.skillId }),
        select: { id: true },
      });
      if (!s) return [];
      return ctx.prisma.skillVersion.findMany({
        ...query,
        where: { skillId: s.id },
        orderBy: { revisionNumber: "desc" },
      });
    },
  }),
);

// Public catalog: skills other workspaces published (sharingScope=public). Read-only, member+.
builder.queryField("skillCatalog", (t) =>
  t.prismaField({
    type: ["Skill"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      // ONLY sharingScope=public + never the caller's own workspace — never a private/workspace leak.
      return ctx.prisma.skill.findMany({
        ...query,
        where: { sharingScope: "public", workspaceId: { not: tenancy.workspaceId } },
        orderBy: [{ installCount: "desc" }, { starCount: "desc" }, { updatedAt: "desc" }],
        take: 100,
      });
    },
  }),
);

// Skill "test-run": static validation of a skill's entry doc + bundle files (no code execution).
builder.queryField("lintSkill", (t) =>
  t.field({
    type: [SkillLintFinding],
    args: { skillId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const skill = await ctx.prisma.skill.findFirst({
        where: scoped(ctx, { id: args.skillId }),
        select: { markdown: true, files: { select: { path: true, content: true } } },
      });
      if (!skill) return [];
      return lintSkill({ markdown: skill.markdown, files: skill.files });
    },
  }),
);

builder.queryField("skillFiles", (t) =>
  t.prismaField({
    type: ["SkillFile"],
    args: { skillId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const s = await ctx.prisma.skill.findFirst({
        where: scoped(ctx, { id: args.skillId }),
        select: { id: true },
      });
      if (!s) return [];
      return ctx.prisma.skillFile.findMany({
        ...query,
        where: { skillId: s.id },
        orderBy: { path: "asc" },
      });
    },
  }),
);

builder.queryField("agentSkills", (t) =>
  t.prismaField({
    type: ["AgentSkill"],
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.agentSkill.findMany({
        ...query,
        where: scoped(ctx, { agentId: args.agentId }),
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);

builder.queryField("teams", (t) =>
  t.prismaField({
    type: ["Team"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.team.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { updatedAt: "desc" },
      });
    },
  }),
);

builder.queryField("team", (t) =>
  t.prismaField({
    type: "Team",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.team.findFirst({ ...query, where: scoped(ctx, { id: args.id }) });
    },
  }),
);

// Install-wizard dry-run: preview which agents installing a team would create/rename/skip/replace.
builder.queryField("previewTeamInstall", (t) =>
  t.field({
    type: [TeamInstallPlanItemType],
    args: { teamId: t.arg.string({ required: true }), collisionStrategy: t.arg.string() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const strategy: CollisionStrategy = isCollisionStrategy(args.collisionStrategy ?? "")
        ? (args.collisionStrategy as CollisionStrategy)
        : "rename";
      return previewTeamInstall({
        workspaceId: tenancy.workspaceId,
        teamId: args.teamId,
        collisionStrategy: strategy,
      });
    },
  }),
);

// Browse the app-shipped markdown teams catalog (SKILLS_TEAMS-gated, member+). In-memory, not scoped.
builder.queryField("teamCatalog", (t) =>
  t.field({
    type: [CatalogTeamType],
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listTeamCatalog();
    },
  }),
);

// Domain 5 GAP-F: skill governance policy. Read (member) + debug evaluate. Replace mutation is admin.
const SkillPolicyType = builder.simpleObject("SkillPolicy", {
  fields: (t) => ({
    defaultEffect: t.string(),
    rules: t.field({ type: "JSON" }),
    revision: t.int(),
  }),
});

builder.queryField("skillPolicy", (t) =>
  t.field({
    type: SkillPolicyType,
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return getSkillPolicy(tenancy.workspaceId);
    },
  }),
);

const SkillPolicyDecisionType = builder.simpleObject("SkillPolicyDecision", {
  fields: (t) => ({
    allowed: t.boolean(),
    effect: t.string(),
    matchedRuleId: t.string({ nullable: true }),
    reason: t.string(),
    remediation: t.string({ nullable: true }),
  }),
});

builder.queryField("evaluateSkillPolicy", (t) =>
  t.field({
    type: SkillPolicyDecisionType,
    args: {
      action: t.arg.string({ required: true }),
      agentId: t.arg.string(),
      role: t.arg.string(),
      skillId: t.arg.string(),
      skillKey: t.arg.string(),
      sourceType: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      if (!isSkillAction(args.action)) throw new Error(`unknown skill action: ${args.action}`);
      return evaluateSkillAction(
        tenancy.workspaceId,
        args.action,
        { agentId: args.agentId ?? null, role: args.role ?? tenancy.role },
        {
          skillId: args.skillId ?? null,
          skillKey: args.skillKey ?? null,
          sourceType: args.sourceType ?? null,
        },
      );
    },
  }),
);

// Domain 5 GAP-D: static security audit of a skill bundle → verdict + coded findings.
const SkillAuditFinding = builder.simpleObject("SkillAuditFinding", {
  fields: (t) => ({
    code: t.string(),
    severity: t.string(),
    message: t.string(),
    path: t.string({ nullable: true }),
  }),
});
const SkillAuditResult = builder.simpleObject("SkillAuditResult", {
  fields: (t) => ({
    verdict: t.string(),
    findings: t.field({ type: [SkillAuditFinding] }),
  }),
});

builder.queryField("auditSkill", (t) =>
  t.field({
    type: SkillAuditResult,
    args: { skillId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const skill = await ctx.prisma.skill.findFirst({
        where: scoped(ctx, { id: args.skillId }),
        select: { markdown: true, files: { select: { path: true, content: true } } },
      });
      if (!skill) return { verdict: "pass", findings: [] };
      return auditSkill({ markdown: skill.markdown, files: skill.files });
    },
  }),
);
