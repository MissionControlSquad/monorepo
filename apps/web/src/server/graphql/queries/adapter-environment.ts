import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { adapterPreflight } from "@/server/services/adapter-preflight";

// Adapter environment preflight ("Test connection") — Paperclip parity. Probes that a runtime adapter is
// installed + reachable + authenticated on this host before a run is dispatched. MULTI_PROVIDER_ADAPTERS
// gated + admin-only (the probe spawns the runtime CLI). Returns per-check green/red rows for the UI.
const AdapterPreflightCheckType = builder.simpleObject("AdapterPreflightCheck", {
  fields: (t) => ({
    name: t.string(),
    ok: t.boolean(),
    detail: t.string({ nullable: true }),
  }),
});

const AdapterPreflightResultType = builder.simpleObject("AdapterPreflightResult", {
  fields: (t) => ({
    ok: t.boolean(),
    checks: t.field({ type: [AdapterPreflightCheckType] }),
    errorFamily: t.string({ nullable: true }),
  }),
});

builder.queryField("testAdapterEnvironment", (t) =>
  t.field({
    type: AdapterPreflightResultType,
    args: {
      key: t.arg.string({ required: true }),
      model: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.MULTI_PROVIDER_ADAPTERS);
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return adapterPreflight(args.key, { model: args.model ?? null });
    },
  }),
);
