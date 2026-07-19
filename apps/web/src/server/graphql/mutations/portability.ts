import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS, isCollisionStrategy } from "@agentcenter/utils";
import type { CollisionStrategy } from "@agentcenter/database";
import { requireRole } from "@/server/tenancy";
import { importWorkspaceBundle } from "@/server/services/portability";

// Epic #14: import a bundle. admin only — it provisions agents/projects/skills (high blast radius).
builder.mutationField("importWorkspaceBundle", (t) =>
  t.prismaField({
    type: "WorkspaceImport",
    args: {
      bundle: t.arg({ type: "JSON", required: true }),
      collisionStrategy: t.arg.string(),
    },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.WORKSPACE_PORTABILITY);
      const tenancy = requireRole(ctx, "admin");
      const strategy = isCollisionStrategy(args.collisionStrategy ?? "")
        ? (args.collisionStrategy as CollisionStrategy)
        : "rename";
      const res = await importWorkspaceBundle({
        workspaceId: tenancy.workspaceId,
        bundle: args.bundle,
        collisionStrategy: strategy,
        importedByProfileId: tenancy.userId,
      });
      return ctx.prisma.workspaceImport.findUniqueOrThrow({
        ...query,
        where: { id: res.importId },
      });
    },
  }),
);
