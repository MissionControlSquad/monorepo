import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { approveCliAuth, denyCliAuth } from "@/server/services/cli-auth";

// Epic #12: CLI device-auth approval (browser side, authenticated). Approving mints an API key bound
// to the approver's workspace — a privileged action, so admin-only + API_KEYS-gated, matching mint.

const CliAuthApproval = builder.simpleObject("CliAuthApproval", {
  fields: (t) => ({
    keyName: t.string(),
  }),
});

builder.mutationField("approveCliAuth", (t) =>
  t.field({
    type: CliAuthApproval,
    args: { userCode: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.API_KEYS);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      return approveCliAuth({
        userCode: args.userCode,
        workspaceId: tenancy.workspaceId,
        profileId: tenancy.userId,
      });
    },
  }),
);

builder.mutationField("denyCliAuth", (t) =>
  t.field({
    type: "Boolean",
    args: { userCode: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.API_KEYS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return denyCliAuth(args.userCode);
    },
  }),
);
