import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { dismissAttentionItem, undismissAttentionItem } from "@/server/services/attention";

// Epic #20b: dismiss / restore an attention feed item. member, ATTENTION-gated.
builder.mutationField("dismissAttentionItem", (t) =>
  t.field({
    type: "Boolean",
    // snoozeHours > 0 hides the item until then (it re-surfaces after); omit/0 dismisses permanently.
    args: { itemKey: t.arg.string({ required: true }), snoozeHours: t.arg.int() },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ATTENTION);
      const tenancy = requireRole(ctx, "member");
      const snoozedUntil =
        args.snoozeHours && args.snoozeHours > 0
          ? new Date(Date.now() + args.snoozeHours * 3600_000)
          : null;
      return dismissAttentionItem(tenancy.workspaceId, args.itemKey, tenancy.userId, snoozedUntil);
    },
  }),
);

builder.mutationField("undismissAttentionItem", (t) =>
  t.field({
    type: "Boolean",
    args: { itemKey: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.ATTENTION);
      const tenancy = requireRole(ctx, "member");
      return undismissAttentionItem(tenancy.workspaceId, args.itemKey);
    },
  }),
);
