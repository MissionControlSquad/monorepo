import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";

// Tier D: list registered BYO hosts (never exposes the private key). RUNNERS-gated, member+.
builder.queryField("runnerHosts", (t) =>
  t.prismaField({
    type: ["RunnerHost"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "member");
      return ctx.prisma.runnerHost.findMany({
        ...query,
        where: { workspaceId: tenancy.workspaceId },
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);
