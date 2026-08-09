import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { submitFeedback } from "@/server/services/feedback";

// Parity #60/#62: submit feedback (thumbs-up/down + optional comment). FEEDBACK-gated, member+.
// The comment is redacted of secrets/PII server-side before storage (#61).
builder.mutationField("submitFeedback", (t) =>
  t.prismaField({
    type: "Feedback",
    args: {
      targetType: t.arg.string({ required: true }),
      targetId: t.arg.string(),
      rating: t.arg.string({ required: true }),
      comment: t.arg.string(),
    },
    resolve: async (_query, _root, args, ctx) => {
      await requireFeature(FLAG_KEYS.FEEDBACK);
      const tenancy = requireRole(ctx, "member");
      return submitFeedback({
        workspaceId: tenancy.workspaceId,
        targetType: args.targetType,
        targetId: args.targetId ?? null,
        rating: args.rating,
        comment: args.comment ?? null,
        submittedByProfileId: tenancy.userId,
      });
    },
  }),
);
