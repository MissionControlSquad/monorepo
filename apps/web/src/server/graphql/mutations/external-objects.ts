import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { upsertExternalObject, refreshExternalObject, deleteExternalObject } from "@/server/services/external-objects";

builder.mutationField("upsertExternalObject", (t) =>
  t.prismaField({
    type: "ExternalObject",
    args: { reference: t.arg.string({ required: true }), linkedType: t.arg.string(), linkedId: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.EXTERNAL_OBJECTS);
      const tn = requireRole(ctx, "member");
      return upsertExternalObject({ workspaceId: tn.workspaceId, reference: args.reference, linkedType: args.linkedType ?? null, linkedId: args.linkedId ?? null });
    },
  }),
);
builder.mutationField("refreshExternalObject", (t) =>
  t.prismaField({ type: "ExternalObject", args: { id: t.arg.string({ required: true }) },
    resolve: async (_q, _r, args, ctx) => { await requireFeature(FLAG_KEYS.EXTERNAL_OBJECTS); const tn = requireRole(ctx, "member"); return refreshExternalObject(tn.workspaceId, args.id); } }),
);
builder.mutationField("deleteExternalObject", (t) =>
  t.field({ type: "Boolean", args: { id: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => { await requireFeature(FLAG_KEYS.EXTERNAL_OBJECTS); const tn = requireRole(ctx, "member"); return deleteExternalObject(tn.workspaceId, args.id); } }),
);
