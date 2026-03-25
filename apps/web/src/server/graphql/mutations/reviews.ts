import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import { agentModel } from "../../models";
import { Roles } from "../../constants";
import { isSystemShutdown } from "../../system-settings";
import {
  performApproveTask,
  performRejectTask,
  performRequestClarification,
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
    resolve: async (_root, args) => {
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
    resolve: async (_root, args) => {
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
    resolve: async (_root, args) => {
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
