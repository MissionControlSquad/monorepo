import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { listProviderAuthStates } from "@/server/services/provider-auth";

builder.queryField("providerAuthStates", (t) =>
  t.prismaField({
    type: ["ProviderAuthState"],
    args: { provider: t.arg.string(), needsAttention: t.arg.boolean() },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.PROVIDER_AUTH);
      const tn = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return listProviderAuthStates(tn.workspaceId, {
        provider: args.provider ?? undefined,
        needsAttention: args.needsAttention ?? undefined,
      });
    },
  }),
);
