import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { listInboxPolicies } from "@/server/services/inbox-policies";

builder.queryField("inboxPolicies", (t) =>
  t.prismaField({
    type: ["InboxPolicy"],
    args: { itemKind: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.INBOX_POLICY);
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listInboxPolicies(tn.workspaceId, args.itemKind ?? undefined);
    },
  }),
);
