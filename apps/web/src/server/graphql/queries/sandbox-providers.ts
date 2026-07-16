import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import {
  listSandboxProviders,
  isSandboxProviderConfigured,
} from "@/server/services/sandbox-providers";

// Tier D: list sandbox providers (local runs with no keys; cloud ones require an API key + SDK).
// RUNNERS-gated, member+.
const SandboxProviderType = builder.simpleObject("SandboxProvider", {
  fields: (t) => ({
    key: t.string(),
    displayName: t.string(),
    requiresApiKey: t.boolean(),
    /** configured = this deployment has the provider's credentials (env keys) set. */
    configured: t.boolean(),
    /** available = runnable now (local, or a configured cloud provider with its SDK wired). */
    available: t.boolean(),
  }),
});

builder.queryField("sandboxProviders", (t) =>
  t.field({
    type: [SandboxProviderType],
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      requireRole(ctx, "member");
      return listSandboxProviders().map((p) => {
        const configured = isSandboxProviderConfigured(p);
        return {
          key: p.key,
          displayName: p.displayName,
          requiresApiKey: p.requiresApiKey,
          configured,
          // local is always runnable; cloud providers need their SDK wired (pending), so not yet
          // "available" even when configured — reflected honestly.
          available: !p.requiresApiKey,
        };
      });
    },
  }),
);
