import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import {
  listSandboxProviders,
  isSandboxProviderConfigured,
} from "@/server/services/sandbox-providers";
import { resolveWorkspaceSecret } from "@/server/services/secrets";

// Tier D: list sandbox providers (local runs with no keys; cloud ones are BYO — the workspace stores
// its own credentials in the secrets vault). RUNNERS-gated, member+.
const SandboxProviderType = builder.simpleObject("SandboxProvider", {
  fields: (t) => ({
    key: t.string(),
    displayName: t.string(),
    requiresApiKey: t.boolean(),
    /** The vault secret NAMES the workspace must add for this provider (so the UI can guide setup). */
    credentialKeys: t.stringList(),
    /** isolating = runs untrusted code in an isolated box; false = on the host (`local`). Low-trust
     * agents may only use isolating providers (fail-closed admission). */
    isolating: t.boolean(),
    /** configured = this WORKSPACE has stored the provider's credentials (by secret name) in the vault. */
    configured: t.boolean(),
    /** available = runnable now (local, or a workspace-configured cloud provider — its SDK still needed). */
    available: t.boolean(),
  }),
});

builder.queryField("sandboxProviders", (t) =>
  t.field({
    type: [SandboxProviderType],
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      const tenancy = requireRole(ctx, "member");
      const resolveSecret = (name: string) => resolveWorkspaceSecret(tenancy.workspaceId, name);
      return Promise.all(
        listSandboxProviders().map(async (p) => {
          const configured = await isSandboxProviderConfigured(p, resolveSecret);
          return {
            key: p.key,
            displayName: p.displayName,
            requiresApiKey: p.requiresApiKey,
            credentialKeys: p.credentialKeys,
            isolating: p.isolating,
            configured,
            // Runnable now = local, or a cloud provider whose BYO creds are present (the vendor SDK
            // must also be installed on the deployment to actually provision — reflected honestly).
            available: !p.requiresApiKey || configured,
          };
        }),
      );
    },
  }),
);
