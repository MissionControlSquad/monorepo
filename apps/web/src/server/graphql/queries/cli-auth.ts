import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { lookupCliAuth } from "@/server/services/cli-auth";

// Epic #12: look up a pending CLI device-auth challenge by its userCode, so the browser approval page
// can show what's being authorized before the user confirms. Member-visible; API_KEYS-gated.

const CliAuthChallenge = builder.simpleObject("CliAuthChallengeInfo", {
  fields: (t) => ({
    keyName: t.string(),
    status: t.string(),
  }),
});

builder.queryField("cliAuthChallenge", (t) =>
  t.field({
    type: CliAuthChallenge,
    nullable: true,
    args: { userCode: t.arg.string({ required: true }) },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.API_KEYS);
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return lookupCliAuth(args.userCode);
    },
  }),
);
