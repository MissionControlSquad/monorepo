import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS, isCollisionStrategy } from "@agentcenter/utils";
import type {
  SkillTrustLevel,
  SkillSharingScope,
  TeamKind,
  TeamTrustLevel,
  CollisionStrategy,
} from "@agentcenter/database";
import { requireRole } from "@/server/tenancy";
import {
  createSkill,
  updateSkill,
  deleteSkill,
  forkSkill,
  starSkill,
  unstarSkill,
  assignSkillToAgent,
  unassignSkillFromAgent,
  upsertSkillFile,
  deleteSkillFile,
  installCatalogSkill,
} from "@/server/services/skills";
import {
  createTeam,
  addTeamMember,
  installTeam,
  installTeamFromCatalog,
} from "@/server/services/teams";
import { assertSkillAction, replaceSkillPolicy } from "@/server/services/skill-policy";

// Epic #10: skills + teams mutations. Skill authoring/assign is member; team install is admin
// (it provisions agents in the workspace).
builder.mutationField("createSkill", (t) =>
  t.prismaField({
    type: "Skill",
    args: {
      name: t.arg.string({ required: true }),
      markdown: t.arg.string({ required: true }),
      key: t.arg.string(),
      description: t.arg.string(),
      categories: t.arg.stringList(),
      trustLevel: t.arg.string(),
      sharingScope: t.arg.string(),
      icon: t.arg.string(),
      color: t.arg.string(),
      tagline: t.arg.string(),
      author: t.arg.string(),
      homepage: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      await assertSkillAction(tenancy.workspaceId, "create", { role: tenancy.role });
      const s = await createSkill({
        workspaceId: tenancy.workspaceId,
        createdByProfileId: tenancy.userId,
        name: args.name,
        markdown: args.markdown,
        key: args.key ?? null,
        description: args.description ?? null,
        categories: args.categories ?? null,
        trustLevel: (args.trustLevel as SkillTrustLevel) ?? null,
        sharingScope: (args.sharingScope as SkillSharingScope) ?? null,
        icon: args.icon ?? null,
        color: args.color ?? null,
        tagline: args.tagline ?? null,
        author: args.author ?? null,
        homepage: args.homepage ?? null,
      });
      return ctx.prisma.skill.findUniqueOrThrow({ ...query, where: { id: s.id } });
    },
  }),
);

builder.mutationField("updateSkill", (t) =>
  t.prismaField({
    type: "Skill",
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      description: t.arg.string(),
      markdown: t.arg.string(),
      categories: t.arg.stringList(),
      trustLevel: t.arg.string(),
      sharingScope: t.arg.string(),
      icon: t.arg.string(),
      color: t.arg.string(),
      tagline: t.arg.string(),
      author: t.arg.string(),
      homepage: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      await assertSkillAction(
        tenancy.workspaceId,
        "edit",
        { role: tenancy.role },
        { skillId: args.id },
      );
      const s = await updateSkill(
        tenancy.workspaceId,
        args.id,
        {
          name: args.name ?? null,
          description: args.description ?? undefined,
          markdown: args.markdown ?? null,
          categories: args.categories ?? null,
          trustLevel: (args.trustLevel as SkillTrustLevel) ?? null,
          sharingScope: (args.sharingScope as SkillSharingScope) ?? null,
          icon: args.icon ?? undefined,
          color: args.color ?? undefined,
          tagline: args.tagline ?? undefined,
          author: args.author ?? undefined,
          homepage: args.homepage ?? undefined,
        },
        tenancy.userId,
      );
      return ctx.prisma.skill.findUniqueOrThrow({ ...query, where: { id: s.id } });
    },
  }),
);

builder.mutationField("deleteSkill", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      await assertSkillAction(
        tenancy.workspaceId,
        "remove",
        { role: tenancy.role },
        { skillId: args.id },
      );
      return deleteSkill(tenancy.workspaceId, args.id);
    },
  }),
);

builder.mutationField("forkSkill", (t) =>
  t.prismaField({
    type: "Skill",
    // `force` overrides the duplicate-fork precheck (the UI warns first, then re-submits with force).
    args: { id: t.arg.string({ required: true }), force: t.arg.boolean() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      await assertSkillAction(
        tenancy.workspaceId,
        "create",
        { role: tenancy.role },
        { skillId: args.id },
      );
      const s = await forkSkill(tenancy.workspaceId, args.id, tenancy.userId, {
        force: args.force ?? false,
      });
      return ctx.prisma.skill.findUniqueOrThrow({ ...query, where: { id: s.id } });
    },
  }),
);

builder.mutationField("starSkill", (t) =>
  t.field({
    type: "Int",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      return starSkill(tenancy.workspaceId, args.id, tenancy.userId);
    },
  }),
);

builder.mutationField("unstarSkill", (t) =>
  t.field({
    type: "Int",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      return unstarSkill(tenancy.workspaceId, args.id, tenancy.userId);
    },
  }),
);

builder.mutationField("assignSkill", (t) =>
  t.prismaField({
    type: "AgentSkill",
    args: {
      agentId: t.arg.string({ required: true }),
      skillId: t.arg.string({ required: true }),
      pinnedVersion: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      const link = await assignSkillToAgent({
        workspaceId: tenancy.workspaceId,
        agentId: args.agentId,
        skillId: args.skillId,
        pinnedVersion: args.pinnedVersion ?? null,
      });
      return ctx.prisma.agentSkill.findUniqueOrThrow({ ...query, where: { id: link.id } });
    },
  }),
);

builder.mutationField("unassignSkill", (t) =>
  t.field({
    type: "Boolean",
    args: { agentId: t.arg.string({ required: true }), skillId: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      return unassignSkillFromAgent(tenancy.workspaceId, args.agentId, args.skillId);
    },
  }),
);

builder.mutationField("installCatalogSkill", (t) =>
  t.prismaField({
    type: "Skill",
    args: { skillId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      await assertSkillAction(tenancy.workspaceId, "install", { role: tenancy.role });
      const skill = await installCatalogSkill(tenancy.workspaceId, args.skillId, tenancy.userId);
      return ctx.prisma.skill.findUniqueOrThrow({ ...query, where: { id: skill.id } });
    },
  }),
);

builder.mutationField("upsertSkillFile", (t) =>
  t.prismaField({
    type: "SkillFile",
    args: {
      skillId: t.arg.string({ required: true }),
      path: t.arg.string({ required: true }),
      content: t.arg.string({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      const file = await upsertSkillFile(tenancy.workspaceId, args.skillId, {
        path: args.path,
        content: args.content,
      });
      return ctx.prisma.skillFile.findUniqueOrThrow({ ...query, where: { id: file.id } });
    },
  }),
);

builder.mutationField("deleteSkillFile", (t) =>
  t.field({
    type: "Boolean",
    args: { skillId: t.arg.string({ required: true }), path: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      return deleteSkillFile(tenancy.workspaceId, args.skillId, args.path);
    },
  }),
);

builder.mutationField("createTeam", (t) =>
  t.prismaField({
    type: "Team",
    args: {
      name: t.arg.string({ required: true }),
      key: t.arg.string(),
      description: t.arg.string(),
      kind: t.arg.string(),
      trustLevel: t.arg.string(),
      icon: t.arg.string(),
      tagline: t.arg.string(),
      author: t.arg.string(),
      tags: t.arg.stringList(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      const team = await createTeam({
        workspaceId: tenancy.workspaceId,
        createdByProfileId: tenancy.userId,
        name: args.name,
        key: args.key ?? null,
        description: args.description ?? null,
        kind: (args.kind as TeamKind) ?? null,
        trustLevel: (args.trustLevel as TeamTrustLevel) ?? null,
        icon: args.icon ?? null,
        tagline: args.tagline ?? null,
        author: args.author ?? null,
        tags: args.tags ?? null,
      });
      return ctx.prisma.team.findUniqueOrThrow({ ...query, where: { id: team.id } });
    },
  }),
);

builder.mutationField("addTeamMember", (t) =>
  t.prismaField({
    type: "TeamMember",
    args: {
      teamId: t.arg.string({ required: true }),
      name: t.arg.string({ required: true }),
      role: t.arg.string({ required: true }),
      templateId: t.arg.string(),
      skills: t.arg.stringList(),
      order: t.arg.int(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "member");
      const m = await addTeamMember(tenancy.workspaceId, args.teamId, {
        name: args.name,
        role: args.role,
        templateId: args.templateId ?? null,
        skills: args.skills ?? null,
        order: args.order ?? null,
      });
      return ctx.prisma.teamMember.findUniqueOrThrow({ ...query, where: { id: m.id } });
    },
  }),
);

// Install a team from the app-shipped markdown catalog (admin): sha256-verify the pinned package, then
// create the workspace Team + its role members. Agents are provisioned afterwards via installTeam.
builder.mutationField("installTeamFromCatalog", (t) =>
  t.prismaField({
    type: "Team",
    args: { ref: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "admin");
      const team = await installTeamFromCatalog({
        workspaceId: tenancy.workspaceId,
        ref: args.ref,
        createdByProfileId: tenancy.userId,
      });
      return ctx.prisma.team.findUniqueOrThrow({ ...query, where: { id: team.id } });
    },
  }),
);

builder.mutationField("installTeam", (t) =>
  t.prismaField({
    type: "TeamInstall",
    args: { teamId: t.arg.string({ required: true }), collisionStrategy: t.arg.string() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "admin");
      const strategy = isCollisionStrategy(args.collisionStrategy ?? "")
        ? (args.collisionStrategy as CollisionStrategy)
        : "rename";
      const res = await installTeam({
        workspaceId: tenancy.workspaceId,
        teamId: args.teamId,
        collisionStrategy: strategy,
        installedByProfileId: tenancy.userId,
      });
      return ctx.prisma.teamInstall.findUniqueOrThrow({ ...query, where: { id: res.installId } });
    },
  }),
);

// Domain 5 GAP-F: replace the workspace skill policy (admin). Optimistic concurrency via expectedRevision.
builder.mutationField("replaceSkillPolicy", (t) =>
  t.field({
    type: "JSON",
    args: {
      defaultEffect: t.arg.string({ required: true }),
      rules: t.arg({ type: "JSON", required: true }),
      expectedRevision: t.arg.int(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      const tenancy = requireRole(ctx, "admin");
      return replaceSkillPolicy({
        workspaceId: tenancy.workspaceId,
        defaultEffect: args.defaultEffect,
        rules: args.rules,
        expectedRevision: args.expectedRevision ?? null,
        updatedByProfileId: tenancy.userId,
      });
    },
  }),
);
