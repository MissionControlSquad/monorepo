import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { listSandboxProviders } from "@/server/services/sandbox-providers";

// Tier D: list sandbox providers (local runs with no keys; cloud ones require an API key + SDK).
// RUNNERS-gated, member+.
const SandboxProviderType = builder.simpleObject("SandboxProvider", {
  fields: (t) => ({
    key: t.string(),
    displayName: t.string(),
    requiresApiKey: t.boolean(),
    /** available = runnable in this environment (only the local provider, until a cloud SDK is wired). */
    available: t.boolean(),
  }),
});

builder.queryField("sandboxProviders", (t) =>
  t.field({
    type: [SandboxProviderType],
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      requireRole(ctx, "member");
      return listSandboxProviders().map((p) => ({
        key: p.key,
        displayName: p.displayName,
        requiresApiKey: p.requiresApiKey,
        available: !p.requiresApiKey,
      }));
    },
  }),
);
