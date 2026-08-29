import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { createAssetUploadUrl, recordAsset, deleteAsset } from "@/server/services/assets";

// Assets (parity #15/#27). ASSETS-gated, member+ (mutations admin for delete). Two-step upload:
// createAssetUploadUrl → client PUTs to R2 → recordAsset.
const AssetUpload = builder.simpleObject("AssetUpload", {
  fields: (t) => ({ key: t.string(), uploadUrl: t.string() }),
});

builder.mutationField("createAssetUploadUrl", (t) =>
  t.field({
    type: AssetUpload,
    args: {
      fileName: t.arg.string({ required: true }),
      mimeType: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ASSETS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return createAssetUploadUrl(args.fileName, args.mimeType);
    },
  }),
);

builder.mutationField("recordAsset", (t) =>
  t.prismaField({
    type: "Asset",
    args: {
      name: t.arg.string({ required: true }),
      kind: t.arg.string({ required: true }),
      mimeType: t.arg.string({ required: true }),
      storageKey: t.arg.string({ required: true }),
      sizeBytes: t.arg.int(),
      ownerType: t.arg.string(),
      ownerId: t.arg.string(),
    },
    resolve: async (_query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ASSETS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return recordAsset({
        workspaceId: tenancy.workspaceId,
        name: args.name,
        kind: args.kind,
        mimeType: args.mimeType,
        storageKey: args.storageKey,
        sizeBytes: args.sizeBytes ?? 0,
        ownerType: args.ownerType ?? null,
        ownerId: args.ownerId ?? null,
        uploadedByProfileId: tenancy.userId,
      });
    },
  }),
);

builder.mutationField("deleteAsset", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ASSETS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return deleteAsset(tenancy.workspaceId, args.id);
    },
  }),
);
