import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

// Epic #12: API keys read — API_KEYS-gated, workspace-scoped, admin (they are auth credentials).
// keyHash is not a schema field, so it can never be selected here.
builder.queryField("apiKeys", (t) =>
  t.prismaField({
    type: ["ApiKey"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.API_KEYS);
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return ctx.prisma.apiKey.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { createdAt: "desc" },
      });
    },
  }),
);
