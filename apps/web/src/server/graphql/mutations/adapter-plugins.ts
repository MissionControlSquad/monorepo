import { builder } from "../builder";
import { requireRole } from "@/server/tenancy";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { upsertAdapterPlugin, deleteAdapterPlugin } from "@/server/services/adapter-plugins";

builder.mutationField("upsertAdapterPlugin", (t) =>
  t.prismaField({
    type: "AdapterPlugin",
    args: {
      key: t.arg.string({ required: true }),
      base: t.arg.string({ required: true }),
      template: t.arg.stringList({ required: true }),
      displayName: t.arg.string(),
      models: t.arg.stringList(),
      supportsModel: t.arg.boolean(),
      enabled: t.arg.boolean(),
    },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.ADAPTER_PLUGINS);
      const tn = requireRole(ctx, "admin");
      return upsertAdapterPlugin({
        workspaceId: tn.workspaceId,
        key: args.key,
        base: args.base,
        template: args.template,
        displayName: args.displayName ?? null,
        models: args.models ?? undefined,
        supportsModel: args.supportsModel ?? undefined,
        enabled: args.enabled ?? undefined,
        createdByProfileId: tn.userId,
      });
    },
  }),
);
builder.mutationField("deleteAdapterPlugin", (t) =>
  t.field({
    type: "Boolean",
    args: { key: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => {
      await requireFeature(FLAG_KEYS.ADAPTER_PLUGINS);
      const tn = requireRole(ctx, "admin");
      return deleteAdapterPlugin(tn.workspaceId, args.key);
    },
  }),
);
