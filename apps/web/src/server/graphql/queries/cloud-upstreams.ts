import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { listCloudUpstreams, planSync } from "@/server/services/cloud-upstreams";

const UpstreamSyncPlan = builder.simpleObject("UpstreamSyncPlan", {
  fields: (t) => ({
    state: t.string(),
    action: t.string(),
    reason: t.string(),
    needsReconcile: t.boolean(),
  }),
});
builder.queryField("cloudUpstreams", (t) =>
  t.prismaField({
    type: ["CloudUpstream"],
    args: { projectId: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.CLOUD_UPSTREAMS);
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listCloudUpstreams(tn.workspaceId, args.projectId ?? undefined);
    },
  }),
);
builder.queryField("cloudUpstreamPlan", (t) =>
  t.field({
    type: UpstreamSyncPlan,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => {
      await requireFeature(FLAG_KEYS.CLOUD_UPSTREAMS);
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return planSync(tn.workspaceId, args.id);
    },
  }),
);
