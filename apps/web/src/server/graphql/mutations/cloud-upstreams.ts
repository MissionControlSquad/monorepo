import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { upsertCloudUpstream, deleteCloudUpstream } from "@/server/services/cloud-upstreams";

builder.mutationField("upsertCloudUpstream", (t) =>
  t.prismaField({ type: "CloudUpstream",
    args: { projectId: t.arg.string({ required: true }), name: t.arg.string({ required: true }), remoteUrl: t.arg.string({ required: true }), remoteRef: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => { await requireFeature(FLAG_KEYS.CLOUD_UPSTREAMS); const tn = requireRole(ctx, "admin");
      return upsertCloudUpstream({ workspaceId: tn.workspaceId, projectId: args.projectId, name: args.name, remoteUrl: args.remoteUrl, remoteRef: args.remoteRef ?? undefined, createdByProfileId: tn.userId }); } }),
);
builder.mutationField("deleteCloudUpstream", (t) =>
  t.field({ type: "Boolean", args: { id: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => { await requireFeature(FLAG_KEYS.CLOUD_UPSTREAMS); const tn = requireRole(ctx, "admin"); return deleteCloudUpstream(tn.workspaceId, args.id); } }),
);
