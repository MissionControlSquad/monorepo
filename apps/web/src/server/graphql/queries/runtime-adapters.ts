import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS, listAdapters, type Adapter } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { isFeatureEnabled } from "@/server/feature-flags";
import { ensureAdapterModelProbe } from "@/server/services/adapter-runtime-probes";

// Tier D: list the RUNTIME adapters the control plane / runners can use (openclaw, codex, claude,
// gemini, process, shell, + any registered). Distinct from the provider "adapters" (Tier A). Lets
// the UI offer adapter + model selection for an agent's runner. RUNNERS-gated, member+.
const RuntimeAdapterType = builder.simpleObject("RuntimeAdapter", {
  fields: (t) => ({
    key: t.string(),
    displayName: t.string(),
    requiresTemplate: t.boolean(),
    supportsModel: t.boolean(),
    models: t.stringList(),
    // §3 adapters — live model detection. True when the adapter's `detectModels` hook contributed
    // model ids probed from the installed CLI (curated ∪ live). The UI shows a "detected from your
    // installed CLI" tooltip on the model list when this is set.
    modelsFromCli: t.boolean(),
  }),
});

/**
 * Resolve one adapter's offered models = curated ∪ live-detected. When MULTI_PROVIDER_ADAPTERS is on we
 * install the execFile model probe and call the adapter's `detectModels` (best-effort, never throws);
 * otherwise we return the curated list unchanged. `modelsFromCli` flags whether live detection actually
 * contributed anything (drives the UI tooltip).
 */
async function resolveModelsForAdapter(
  adapter: Adapter,
  liveEnabled: boolean,
): Promise<{ models: string[]; modelsFromCli: boolean }> {
  if (!liveEnabled || !adapter.detectModels) {
    return { models: adapter.models, modelsFromCli: false };
  }
  let live: string[] = [];
  try {
    live = await adapter.detectModels();
  } catch {
    live = [];
  }
  const models = [...new Set([...live, ...adapter.models])];
  return { models, modelsFromCli: live.length > 0 };
}

builder.queryField("runtimeAdapters", (t) =>
  t.field({
    type: [RuntimeAdapterType],
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      // Live CLI model detection is MULTI_PROVIDER_ADAPTERS-gated (it spawns the runtime CLIs).
      const liveEnabled = await isFeatureEnabled(FLAG_KEYS.MULTI_PROVIDER_ADAPTERS);
      if (liveEnabled) ensureAdapterModelProbe();
      const adapters = listAdapters();
      return Promise.all(
        adapters.map(async (a) => {
          const { models, modelsFromCli } = await resolveModelsForAdapter(a, liveEnabled);
          return {
            key: a.key,
            displayName: a.displayName,
            requiresTemplate: a.requiresTemplate,
            supportsModel: a.supportsModel,
            models,
            modelsFromCli,
          };
        }),
      );
    },
  }),
);
