import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { mintApiKey, revokeApiKey } from "@/server/services/api-keys";

// Epic #12: API key mutations. admin only (minting an auth credential is privileged); API_KEYS-gated.

// The mint result carries the plaintext key — the ONLY time it is ever returned.
const MintedApiKey = builder.simpleObject("MintedApiKey", {
  fields: (t) => ({
    id: t.string(),
    name: t.string(),
    keyPrefix: t.string(),
    plainKey: t.string(),
  }),
});

builder.mutationField("mintApiKey", (t) =>
  t.field({
    type: MintedApiKey,
    args: {
      name: t.arg.string({ required: true }),
      expiresAt: t.arg({ type: "DateTime" }),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.API_KEYS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const { apiKey, plainKey } = await mintApiKey({
        workspaceId: tenancy.workspaceId,
        name: args.name,
        expiresAt: args.expiresAt ?? null,
        createdByProfileId: tenancy.userId,
      });
      return { id: apiKey.id, name: apiKey.name, keyPrefix: apiKey.keyPrefix, plainKey };
    },
  }),
);

builder.mutationField("revokeApiKey", (t) =>
  t.field({
    type: "Boolean",
    args: { id: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.API_KEYS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      await revokeApiKey(tenancy.workspaceId, args.id);
      return true;
    },
  }),
);
