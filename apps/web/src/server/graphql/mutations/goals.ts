import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS, isGoalLevel, isGoalStatus } from "@agentcenter/utils";
import type { GoalLevel, GoalStatus } from "@agentcenter/database";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { createGoal, updateGoal, deleteGoal, setProjectDefaultGoal } from "@/server/services/goals";

// Epic #11: goals mutations. Member CRUD (goals are low blast-radius; matches Paperclip company access).
// Level/status vocabulary is shared in @agentcenter/utils (no hardcoded lists).
function asLevel(v: string | null | undefined): GoalLevel | null {
  if (v == null) return null;
  if (!isGoalLevel(v))
    throw new GraphQLError(`invalid level`, { extensions: { code: "BAD_USER_INPUT" } });
  return v as GoalLevel;
}
function asStatus(v: string | null | undefined): GoalStatus | null {
  if (v == null) return null;
  if (!isGoalStatus(v))
    throw new GraphQLError(`invalid status`, { extensions: { code: "BAD_USER_INPUT" } });
  return v as GoalStatus;
}

builder.mutationField("createGoal", (t) =>
  t.prismaField({
    type: "Goal",
    args: {
      title: t.arg.string({ required: true }),
      description: t.arg.string(),
      level: t.arg.string(),
      status: t.arg.string(),
      parentId: t.arg.string(),
      ownerAgentId: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOALS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const g = await createGoal({
        workspaceId: tenancy.workspaceId,
        title: args.title,
        description: args.description ?? null,
        level: asLevel(args.level),
        status: asStatus(args.status),
        parentId: args.parentId ?? null,
        ownerAgentId: args.ownerAgentId ?? null,
      });
      return ctx.prisma.goal.findUniqueOrThrow({ ...query, where: { id: g.id } });
    },
  }),
);

builder.mutationField("updateGoal", (t) =>
  t.prismaField({
    type: "Goal",
    args: {
      id: t.arg.string({ required: true }),
      title: t.arg.string(),
      description: t.arg.string(),
      level: t.arg.string(),
      status: t.arg.string(),
      parentId: t.arg.string(),
      ownerAgentId: t.arg.string(),
      clearParent: t.arg.boolean(),
      clearOwner: t.arg.boolean(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOALS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const g = await updateGoal(tenancy.workspaceId, args.id, {
        title: args.title ?? null,
        description: args.description ?? undefined,
        level: asLevel(args.level),
        status: asStatus(args.status),
        parentId: args.clearParent ? null : (args.parentId ?? undefined),
        ownerAgentId: args.clearOwner ? null : (args.ownerAgentId ?? undefined),
      });
      return ctx.prisma.goal.findUniqueOrThrow({ ...query, where: { id: g.id } });
    },
  }),
);

builder.mutationField("deleteGoal", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOALS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      await deleteGoal(tenancy.workspaceId, args.id);
      return true;
    },
  }),
);

// Epic #11b: set (or clear) a project's default goal — tasks created in it inherit this.
builder.mutationField("setProjectDefaultGoal", (t) =>
  t.prismaField({
    type: "Project",
    args: {
      projectId: t.arg.string({ required: true }),
      goalId: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.GOALS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      await setProjectDefaultGoal(tenancy.workspaceId, args.projectId, args.goalId ?? null);
      return ctx.prisma.project.findUniqueOrThrow({ ...query, where: { id: args.projectId } });
    },
  }),
);
