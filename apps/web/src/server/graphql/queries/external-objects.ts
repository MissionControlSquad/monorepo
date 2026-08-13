import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { listExternalObjects } from "@/server/services/external-objects";

builder.queryField("externalObjects", (t) =>
  t.prismaField({
    type: ["ExternalObject"],
    args: { provider: t.arg.string(), linkedType: t.arg.string(), linkedId: t.arg.string() },
    resolve: async (_q, _r, args, ctx) => {
      await requireFeature(FLAG_KEYS.EXTERNAL_OBJECTS);
      const tn = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listExternalObjects(tn.workspaceId, {
        provider: args.provider ?? undefined,
        linkedType: args.linkedType ?? undefined,
        linkedId: args.linkedId ?? undefined,
      });
    },
  }),
);
