import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { requireRole } from "@/server/tenancy";
import { castVote } from "@/server/services/deliverable-votes";
import { VoteSummaryType } from "../queries/deliverable-votes";

// Tier C: cast/clear a deliverable vote. VOTING-gated, member+. Voter = the caller.
builder.mutationField("castDeliverableVote", (t) =>
  t.field({
    type: VoteSummaryType,
    args: {
      deliverableId: t.arg.string({ required: true }),
      value: t.arg.int({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.VOTING);
      const tenancy = requireRole(ctx, "member");
      return castVote({
        deliverableId: args.deliverableId,
        voterId: tenancy.userId,
        value: args.value,
      });
    },
  }),
);
