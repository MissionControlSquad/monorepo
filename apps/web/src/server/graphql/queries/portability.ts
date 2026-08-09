import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";
import { exportWorkspaceBundle } from "@/server/services/portability";

// Epic #14: portability reads. Export is member (read-only serialization of the caller's workspace);
// import history is member. WORKSPACE_PORTABILITY-gated, workspace-scoped.
builder.queryField("exportWorkspaceBundle", (t) =>
  t.field({
    type: "JSON",
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.WORKSPACE_PORTABILITY);
      const tenancy = requireRole(ctx, "member");
      return exportWorkspaceBundle(tenancy.workspaceId);
    },
  }),
);

builder.queryField("workspaceImports", (t) =>
  t.prismaField({
    type: ["WorkspaceImport"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.WORKSPACE_PORTABILITY);
      requireRole(ctx, "member");
      return ctx.prisma.workspaceImport.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);
