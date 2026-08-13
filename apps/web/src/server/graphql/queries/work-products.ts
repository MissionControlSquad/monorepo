import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

// Domain 8 G1: work products for a task (output-type deliverables). WORK_PRODUCTS-gated, member+.
builder.queryField("workProductsByTask", (t) =>
  t.prismaField({
    type: ["Deliverable"],
    args: { taskId: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.WORK_PRODUCTS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.deliverable.findMany({
        ...query,
        where: {
          taskId: args.taskId,
          kind: { in: ["pull_request", "branch", "commit", "preview_url", "runtime_service"] },
        },
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);
