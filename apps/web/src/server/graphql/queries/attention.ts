import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { getAttentionFeed } from "@/server/services/attention";

// Epic #20: unified attention feed. ATTENTION-gated, member, workspace-scoped.
const AttentionItem = builder.simpleObject("AttentionItem", {
  fields: (t) => ({
    id: t.string(),
    sourceKind: t.string(),
    severity: t.string(),
    subjectKind: t.string(),
    subjectId: t.string(),
    title: t.string(),
    whyNow: t.string(),
    activityAt: t.string(),
  }),
});

const AttentionFeed = builder.simpleObject("AttentionFeed", {
  fields: (t) => ({
    totalCount: t.int(),
    countsBySourceKind: t.field({ type: "JSON" }),
    items: t.field({ type: [AttentionItem] }),
  }),
});

builder.queryField("attentionFeed", (t) =>
  t.field({
    type: AttentionFeed,
    args: { includeDismissed: t.arg.boolean() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ATTENTION);
      const tenancy = requireRole(ctx, "member");
      return getAttentionFeed(tenancy.workspaceId, args.includeDismissed ?? false);
    },
  }),
);
