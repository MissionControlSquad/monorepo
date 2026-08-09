import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { fetchAllProviderQuota } from "@/server/services/provider-quota";

// Domain 12 GAP-2: live provider quota/rate-limit windows. PROVIDER_QUOTA-gated, admin (polling uses
// provider credentials). Returns one entry per adapter that supports the getQuotaWindows hook.
const ProviderQuotaWindowType = builder.simpleObject("ProviderQuotaWindow", {
  fields: (t) => ({
    label: t.string(),
    usedPercent: t.float({ nullable: true }),
    resetsAt: t.string({ nullable: true }),
    valueLabel: t.string({ nullable: true }),
    detail: t.string({ nullable: true }),
  }),
});

const ProviderQuotaResultType = builder.simpleObject("ProviderQuotaResult", {
  fields: (t) => ({
    provider: t.string(),
    ok: t.boolean(),
    windows: t.field({ type: [ProviderQuotaWindowType] }),
    errorFamily: t.string({ nullable: true }),
    error: t.string({ nullable: true }),
  }),
});

builder.queryField("providerQuotaWindows", (t) =>
  t.field({
    type: [ProviderQuotaResultType],
    resolve: async (_root, _args, ctx) => {
      await requireFeature(FLAG_KEYS.PROVIDER_QUOTA);
      requireRole(ctx, "admin");
      return fetchAllProviderQuota();
    },
  }),
);
