import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { listAssets, getAssetDownloadUrl } from "@/server/services/assets";

builder.queryField("assets", (t) =>
  t.prismaField({
    type: ["Asset"],
    args: { kind: t.arg.string(), ownerType: t.arg.string(), ownerId: t.arg.string() },
    resolve: async (_query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ASSETS);
      const tenancy = requireRole(ctx, "member");
      return listAssets(tenancy.workspaceId, {
        kind: args.kind ?? undefined,
        ownerType: args.ownerType ?? undefined,
        ownerId: args.ownerId ?? undefined,
      });
    },
  }),
);

builder.queryField("assetDownloadUrl", (t) =>
  t.field({
    type: "String",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ASSETS);
      const tenancy = requireRole(ctx, "member");
      return getAssetDownloadUrl(tenancy.workspaceId, args.id);
    },
  }),
);
