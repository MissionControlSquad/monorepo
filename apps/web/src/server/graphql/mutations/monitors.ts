import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { GraphQLError } from "graphql";
import { FLAG_KEYS, isMonitorMetric, isMonitorComparator } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { createMonitor, updateMonitor, deleteMonitor } from "@/server/services/monitors";

// Tier C: monitor writes. MONITORS-gated, admin manages.
builder.mutationField("createMonitor", (t) =>
  t.prismaField({
    type: "Monitor",
    args: {
      name: t.arg.string({ required: true }),
      metric: t.arg.string({ required: true }),
      comparator: t.arg.string({ required: true }),
      threshold: t.arg.int({ required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.MONITORS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      if (!isMonitorMetric(args.metric) || !isMonitorComparator(args.comparator))
        throw new GraphQLError("Invalid metric or comparator", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      const m = await createMonitor({
        workspaceId: tenancy.workspaceId,
        name: args.name,
        metric: args.metric,
        comparator: args.comparator,
        threshold: args.threshold,
        createdBy: tenancy.userId,
      });
      return ctx.prisma.monitor.findUniqueOrThrow({ ...query, where: { id: m.id } });
    },
  }),
);

builder.mutationField("updateMonitor", (t) =>
  t.prismaField({
    type: "Monitor",
    args: {
      id: t.arg.string({ required: true }),
      name: t.arg.string(),
      threshold: t.arg.int(),
      isActive: t.arg.boolean(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.MONITORS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const m = await updateMonitor(tenancy.workspaceId, args.id, {
        name: args.name ?? null,
        threshold: args.threshold ?? null,
        isActive: args.isActive ?? null,
      });
      return ctx.prisma.monitor.findUniqueOrThrow({ ...query, where: { id: m.id } });
    },
  }),
);

builder.mutationField("deleteMonitor", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.MONITORS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return deleteMonitor(tenancy.workspaceId, args.id);
    },
  }),
);
