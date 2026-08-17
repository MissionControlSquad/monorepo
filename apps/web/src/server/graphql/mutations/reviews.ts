import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { agentModel } from "../../models";
import { Roles } from "../../constants";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import { prisma } from "@/server/prisma";
import { isSystemShutdown } from "../../system-settings";
import {
  performApproveTask,
  performRejectTask,
  performRequestClarification,
  reviewTaskByHuman,
} from "../../services/review";

const ReviewResultType = builder.simpleObject("ReviewResult", {
  fields: (t) => ({
    success: t.boolean(),
    message: t.string(),
    newStatus: t.string(),
    childTaskIds: t.field({ type: ["String"], nullable: true }),
  }),
});

builder.mutationField("approveTask", (t) =>
  t.field({
    type: ReviewResultType,
    args: {
      reviewerId: t.arg.string({ required: true }),
      taskId: t.arg.string({ required: true }),
      approvalComment: t.arg.string(),
      childTasks: t.arg.string(), // JSON string: [{title, description?, priority?, assigneeIds?}]
    },
    resolve: async (_root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      await requireFeature(FLAG_KEYS.REVIEWS);
      if (await isSystemShutdown())
        throw new Error("System is in shutdown mode. No task approvals allowed.");

      const reviewer = await agentModel.findByIdOrThrow(args.reviewerId);
      if (reviewer.role !== Roles.SQUAD_LEAD) throw new Error("Only Squad Lead can approve tasks");

      const childTasks = args.childTasks
        ? (JSON.parse(args.childTasks) as Array<{
            title: string;
            description?: string;
            priority?: string;
            assigneeIds?: string[];
          }>)
        : undefined;

      const result = await performApproveTask({
        reviewer,
        taskId: args.taskId,
        approvalComment: args.approvalComment,
        childTasks,
      });

      return {
        success: true,
        message: "Task approved and moved to done",
        newStatus: result.newStatus,
        childTaskIds: result.childTaskIds,
      };
    },
  }),
);

builder.mutationField("rejectTask", (t) =>
  t.field({
    type: ReviewResultType,
    args: {
      reviewerId: t.arg.string({ required: true }),
      taskId: t.arg.string({ required: true }),
      rejectionReason: t.arg.string({ required: true }),
      changesNeeded: t.arg.stringList({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      await requireFeature(FLAG_KEYS.REVIEWS);
      if (await isSystemShutdown())
        throw new Error("System is in shutdown mode. No task rejections allowed.");

      const reviewer = await agentModel.findByIdOrThrow(args.reviewerId);
      if (reviewer.role !== Roles.SQUAD_LEAD) throw new Error("Only Squad Lead can reject tasks");

      const result = await performRejectTask({
        reviewer,
        taskId: args.taskId,
        rejectionReason: args.rejectionReason,
        changesNeeded: args.changesNeeded,
      });

      return {
        success: true,
        message: "Task rejected and moved back to assigned",
        newStatus: result.newStatus,
        childTaskIds: null,
      };
    },
  }),
);

builder.mutationField("requestClarification", (t) =>
  t.field({
    type: ReviewResultType,
    args: {
      reviewerId: t.arg.string({ required: true }),
      taskId: t.arg.string({ required: true }),
      questions: t.arg.stringList({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      await requireFeature(FLAG_KEYS.REVIEWS);
      if (await isSystemShutdown())
        throw new Error("System is in shutdown mode. No clarification requests allowed.");

      const reviewer = await agentModel.findByIdOrThrow(args.reviewerId);
      if (reviewer.role !== Roles.SQUAD_LEAD)
        throw new Error("Only Squad Lead can request clarification");

      const result = await performRequestClarification({
        reviewer,
        taskId: args.taskId,
        questions: args.questions,
      });

      return {
        success: true,
        message: "Clarification requested",
        newStatus: result.newStatus,
        childTaskIds: null,
      };
    },
  }),
);

// Domain 8: the HUMAN task-review path. The approveTask/rejectTask mutations above require a
// Squad-Lead AGENT reviewer; this lets a workspace admin sign off (or send back) a task an agent
// has moved to `review`. REVIEWS-gated, admin-only, reuses the shared reviewTaskByHuman service.
builder.mutationField("reviewTask", (t) =>
  t.field({
    type: ReviewResultType,
    args: {
      taskId: t.arg.string({ required: true }),
      decision: t.arg.string({ required: true }), // "approve" | "request_changes"
      note: t.arg.string(),
    },
    resolve: async (_root, args, ctx) => {
      await requireFeature(FLAG_KEYS.REVIEWS);
      if (await isSystemShutdown())
        throw new Error("System is in shutdown mode. No task reviews allowed.");
      const tenancy = requireRole(ctx, WORKSPACE_ROLES.ADMIN);
      const decision = args.decision === "approve" ? "approve" : "request_changes";
      const profile = await prisma.profile.findUnique({
        where: { id: tenancy.userId },
        select: { displayName: true },
      });
      const result = await reviewTaskByHuman({
        taskId: args.taskId,
        reviewerProfileId: tenancy.userId,
        reviewerName: profile?.displayName ?? "Reviewer",
        decision,
        note: args.note ?? null,
      });
      return {
        success: true,
        message: decision === "approve" ? "Task approved and moved to done" : "Task sent back",
        newStatus: result.newStatus,
        childTaskIds: null,
      };
    },
  }),
);
