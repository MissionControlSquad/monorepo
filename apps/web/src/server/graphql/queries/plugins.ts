import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";

// Epic #6: plugin registry read. PLUGIN_SDK-gated (off by default), admin, workspace-scoped.
builder.queryField("plugins", (t) =>
  t.prismaField({
    type: ["Plugin"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.PLUGIN_SDK);
      requireRole(ctx, "admin");
      return ctx.prisma.plugin.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { displayName: "asc" },
      });
    },
  }),
);

// Single plugin (detail page). PLUGIN_SDK-gated, admin, workspace-scoped.
builder.queryField("plugin", (t) =>
  t.prismaField({
    type: "Plugin",
    nullable: true,
    args: { pluginId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.PLUGIN_SDK);
      requireRole(ctx, "admin");
      return ctx.prisma.plugin.findFirst({
        ...query,
        where: scoped(ctx, { pluginId: args.pluginId }),
      });
    },
  }),
);
