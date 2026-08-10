import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { listWorkspaceRuntimeServices } from "@/server/services/workspace-runtime-services";

// WorkspaceRuntimeService reads — long-lived dev/preview processes in an execution workspace.
// LOCAL_SERVICES-gated (this IS the local-services runtime surface), workspace-scoped, member+.
builder.queryField("workspaceRuntimeServices", (t) =>
  t.prismaField({
    type: ["WorkspaceRuntimeService"],
    args: {
      // Optional: scope to one execution workspace. Omit to list all runtime services in the workspace.
      executionWorkspaceId: t.arg.string(),
    },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.LOCAL_SERVICES);
      const tenancy = requireRole(ctx, "member");
      return listWorkspaceRuntimeServices(tenancy.workspaceId, args.executionWorkspaceId);
    },
  }),
);
