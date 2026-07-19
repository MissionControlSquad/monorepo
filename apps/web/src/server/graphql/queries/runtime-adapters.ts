import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS, listAdapters } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";

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
  }),
});

builder.queryField("runtimeAdapters", (t) =>
  t.field({
    type: [RuntimeAdapterType],
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.RUNNERS);
      requireRole(ctx, "member");
      return listAdapters().map((a) => ({
        key: a.key,
        displayName: a.displayName,
        requiresTemplate: a.requiresTemplate,
        supportsModel: a.supportsModel,
        models: a.models,
      }));
    },
  }),
);
