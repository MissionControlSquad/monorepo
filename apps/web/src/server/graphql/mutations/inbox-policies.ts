import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { setInboxPolicy, deleteInboxPolicy } from "@/server/services/inbox-policies";

builder.mutationField("setInboxPolicy", (t) =>
  t.prismaField({ type: "InboxPolicy",
    args: { id: t.arg.string(), agentId: t.arg.string(), itemKind: t.arg.string({ required: true }), action: t.arg.string({ required: true }), priority: t.arg.int(), enabled: t.arg.boolean() },
    resolve: async (_q, _r, args, ctx) => { await requireFeature(FLAG_KEYS.INBOX_POLICY); const tn = requireRole(ctx, "admin");
      return setInboxPolicy({ workspaceId: tn.workspaceId, id: args.id ?? undefined, agentId: args.agentId ?? null, itemKind: args.itemKind, action: args.action, priority: args.priority ?? undefined, enabled: args.enabled ?? undefined }); } }),
);
builder.mutationField("deleteInboxPolicy", (t) =>
  t.field({ type: "Boolean", args: { id: t.arg.string({ required: true }) },
    resolve: async (_r, args, ctx) => { await requireFeature(FLAG_KEYS.INBOX_POLICY); const tn = requireRole(ctx, "admin"); return deleteInboxPolicy(args.id, tn.workspaceId); } }),
);
