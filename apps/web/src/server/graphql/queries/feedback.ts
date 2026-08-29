import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { listFeedback, feedbackSummary } from "@/server/services/feedback";

// Parity #60: read feedback. FEEDBACK-gated, member+, workspace-scoped.
builder.queryField("feedback", (t) =>
  t.prismaField({
    type: ["Feedback"],
    args: {
      targetType: t.arg.string(),
      targetId: t.arg.string(),
      limit: t.arg.int(),
    },
    resolve: async (_query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.FEEDBACK);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return listFeedback(tenancy.workspaceId, {
        targetType: args.targetType,
        targetId: args.targetId,
        limit: args.limit ?? 50,
      });
    },
  }),
);

const FeedbackSummary = builder.simpleObject("FeedbackSummary", {
  fields: (t) => ({ up: t.int(), down: t.int() }),
});

builder.queryField("feedbackSummary", (t) =>
  t.field({
    type: FeedbackSummary,
    args: {
      targetType: t.arg.string({ required: true }),
      targetId: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.FEEDBACK);
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      return feedbackSummary(tenancy.workspaceId, args.targetType, args.targetId);
    },
  }),
);
