import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole, roleAtLeast, scoped } from "@/server/tenancy";
import { getUserSecretCoverage } from "@/server/services/user-secrets";

// Parity §3 #7: user-scoped secret coverage read shape. A plain object (no plaintext, no ciphertext)
// describing, per definition, whether the subject member has provided it.
const UserSecretCoverageItem = builder.simpleObject("UserSecretCoverageItem", {
  fields: (t) => ({
    definitionId: t.string(),
    key: t.string(),
    displayName: t.string(),
    description: t.string({ nullable: true }),
    required: t.boolean(),
    status: t.string(), // "provided" | "missing"
    updatedAt: t.field({ type: "DateTime", nullable: true }),
  }),
});

const UserSecretCoverage = builder.simpleObject("UserSecretCoverage", {
  fields: (t) => ({
    profileId: t.string(),
    total: t.int(), // number of REQUIRED definitions (the "N of M" denominator)
    provided: t.int(),
    missing: t.int(),
    items: t.field({ type: [UserSecretCoverageItem] }),
  }),
});

// The definitions a workspace expects members to provide. SECRETS_VAULT-gated, workspace-scoped,
// member+ (everyone in the workspace can see what's expected of them).
builder.queryField("userSecretDefinitions", (t) =>
  t.prismaField({
    type: ["UserSecretDefinition"],
    resolve: async (query, _root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      requireRole(ctx, "member");
      return ctx.prisma.userSecretDefinition.findMany({
        ...query,
        where: scoped(ctx, {}),
        orderBy: [{ required: "desc" }, { key: "asc" }],
      });
    },
  }),
);

// Coverage for the current member (default) or, for an admin, any member via `profileId`. A member
// may only read their OWN coverage (self-scoped) — never another member's.
builder.queryField("userSecretCoverage", (t) =>
  t.field({
    type: UserSecretCoverage,
    args: { profileId: t.arg.string() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.SECRETS_VAULT);
      const tenancy = requireRole(ctx, "member");
      const target = args.profileId ?? tenancy.userId;
      if (target !== tenancy.userId && !roleAtLeast(tenancy.role, "admin")) {
        throw new GraphQLError("Members can only view their own secret coverage", {
          extensions: { code: "FORBIDDEN" },
        });
      }
      return getUserSecretCoverage({ workspaceId: tenancy.workspaceId, profileId: target });
    },
  }),
);
