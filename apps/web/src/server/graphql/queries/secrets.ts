import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, scoped } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { visibleSecretsWhere } from "@/server/services/secrets";

// Epic #5: secrets vault reads — SECRETS_VAULT-gated, workspace-scoped, member+ (metadata only;
// values are never returned here).
builder.queryField("secrets", (t) =>
  t.prismaField({
    type: ["Secret"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      // All workspace secrets + only the caller's own personal secrets (never another member's).
      return ctx.prisma.secret.findMany({
        ...query,
        where: scoped(ctx, visibleSecretsWhere(tenancy.userId)),
        orderBy: { name: "asc" },
      });
    },
  }),
);

builder.queryField("secret", (t) =>
  t.prismaField({
    type: "Secret",
    nullable: true,
    args: { id: t.arg.string({ required: true }) },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.secret.findFirst({
        ...query,
        where: scoped(ctx, { id: args.id, ...visibleSecretsWhere(tenancy.userId) }),
      });
    },
  }),
);

builder.queryField("secretProviders", (t) =>
  t.prismaField({
    type: ["SecretProviderConfig"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return ctx.prisma.secretProviderConfig.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: { name: "asc" },
      });
    },
  }),
);

builder.queryField("secretAccessEvents", (t) =>
  t.prismaField({
    type: ["SecretAccessEvent"],
    args: { secretId: t.arg.string({ required: true }), limit: t.arg.int() },
    resolve: async (query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      // Scope through the owning secret so another workspace's — or another member's personal —
      // audit is never returned.
      const secret = await ctx.prisma.secret.findFirst({
        where: scoped(ctx, { id: args.secretId, ...visibleSecretsWhere(tenancy.userId) }),
        select: { id: true },
      });
      if (!secret) return [];
      return ctx.prisma.secretAccessEvent.findMany({
        ...query,
        where: { secretId: secret.id },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(args.limit ?? 50, 1), 200),
      });
    },
  }),
);
