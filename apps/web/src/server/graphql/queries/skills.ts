import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";

// Epic #10: skills + teams reads — SKILLS_TEAMS-gated, workspace-scoped, member+.
builder.queryField("skills", (t) =>
  t.prismaField({
    type: ["Skill"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, "member");
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
      requireRole(ctx, "member");
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
      requireRole(ctx, "member");
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

builder.queryField("agentSkills", (t) =>
  t.prismaField({
    type: ["AgentSkill"],
    args: { agentId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SKILLS_TEAMS);
      requireRole(ctx, "member");
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
      requireRole(ctx, "member");
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
      requireRole(ctx, "member");
      return ctx.prisma.team.findFirst({ ...query, where: scoped(ctx, { id: args.id }) });
    },
  }),
);
