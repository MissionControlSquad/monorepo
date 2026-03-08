import { builder } from "../builder";
import { requireFeature } from "../require-feature";
import { FLAG_KEYS } from "../../../lib/feature-flag-keys";
import { agentModel, messageModel } from "../../models";
import { taskModel } from "../../models/task";
import { Roles, TaskStatus } from "../../constants";
import { assertAssignableAgents } from "../../assignment-guard";
import { getOrCreateAgentProfileId } from "../../agent-profile";

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
      childTasks: t.arg.string(), // JSON string: [{title, description, priority?, assigneeIds?}]
    },
    resolve: async (_root, args) => {
      await requireFeature(FLAG_KEYS.REVIEWS);
      const reviewer = await agentModel.findByIdOrThrow(args.reviewerId);
      if (reviewer.role !== Roles.SQUAD_LEAD) {
        throw new Error("Only Squad Lead can approve tasks");
      }

      const task = await taskModel.findById(args.taskId, {
        include: {
          assignees: { include: { profile: { select: { agentId: true, displayName: true } } } },
        },
      });
      if (!task) throw new Error("Task not found");

      // Move to done
      await taskModel.update(args.taskId, {
        data: { status: TaskStatus.DONE },
      });

      // Post approval comment
      const assigneeNames = task.assignees.map((a: any) => a.profile?.displayName ?? "Unknown");
      const comment =
        args.approvalComment ??
        `Task approved by @${reviewer.username ?? reviewer.name}. Great work ${assigneeNames.map((n: string) => `@${n}`).join(", ")}!`;

      const reviewerProfileId = await getOrCreateAgentProfileId(args.reviewerId);

      await messageModel.create({
        data: {
          taskId: args.taskId,
          fromProfileId: reviewerProfileId,
          content: comment,
        },
      });

      // Create child tasks if provided
      const childTaskIds: string[] = [];
      if (args.childTasks) {
        const children = JSON.parse(args.childTasks) as Array<{
          title: string;
          description: string;
          priority?: string;
          assigneeIds?: string[];
        }>;

        for (const child of children) {
          await assertAssignableAgents(child.assigneeIds ?? []);
          // Resolve assigneeIds → profileIds
          const childProfileIds = await Promise.all(
            (child.assigneeIds ?? []).map((id) => getOrCreateAgentProfileId(id)),
          );
          const newTask = await taskModel.create({
            data: {
              title: child.title,
              description: `${child.description}\n\n_Spawned from #${task.taskNumber}: ${task.title}_`,
              status: TaskStatus.INBOX,
              priority: (child.priority as any) ?? undefined,
              parentTaskId: args.taskId,
              projectId: task.projectId ?? undefined,
              assignees: {
                create: childProfileIds.map((profileId) => ({
                  profileId,
                })),
              },
            },
          });
          childTaskIds.push(newTask.id);

          await taskModel.emitCreated(newTask, {
            createdBy: args.reviewerId,
            creatorName: reviewer.name,
            assigneeIds: child.assigneeIds ?? [],
            fromDashboard: false,
          });
        }
      }

      // Resolve assignee agentIds for notification compat
      const assigneeAgentIds = task.assignees
        .map((a: any) => a.profile?.agentId)
        .filter(Boolean) as string[];

      await taskModel.emitApproved(task, {
        reviewerId: args.reviewerId,
        reviewerName: reviewer.name,
        assigneeIds: assigneeAgentIds,
        assigneeNames,
        childTasks: childTaskIds.length
          ? await Promise.all(
              childTaskIds.map(async (id) => {
                const t = await taskModel.findByIdOrThrow(id, {
                  select: { id: true, taskNumber: true, title: true },
                });
                return {
                  taskId: t.id,
                  taskNumber: t.taskNumber,
                  title: t.title,
                };
              }),
            )
          : undefined,
      });

      return {
        success: true,
        message: "Task approved and moved to done",
        newStatus: TaskStatus.DONE,
        childTaskIds: childTaskIds.length ? childTaskIds : null,
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
      const reviewer = await agentModel.findByIdOrThrow(args.reviewerId);
      if (reviewer.role !== Roles.SQUAD_LEAD) {
        throw new Error("Only Squad Lead can reject tasks");
      }

      const task = await taskModel.findById(args.taskId, {
        include: {
          assignees: {
            include: { profile: { select: { agentId: true, displayName: true, username: true } } },
          },
        },
      });
      if (!task) throw new Error("Task not found");

      await taskModel.update(args.taskId, {
        data: { status: TaskStatus.ASSIGNED },
      });

      const changesList = args.changesNeeded.map((c, i) => `${i + 1}. ${c}`).join("\n");
      const mentions = task.assignees
        .map((a: any) => `@${a.profile?.username ?? a.profile?.displayName ?? "unknown"}`)
        .join(" ");

      const rejectProfileId = await getOrCreateAgentProfileId(args.reviewerId);

      await messageModel.create({
        data: {
          taskId: args.taskId,
          fromProfileId: rejectProfileId,
          content: `**Task rejected** by @${reviewer.username ?? reviewer.name}\n\n**Reason:** ${args.rejectionReason}\n\n**Changes needed:**\n${changesList}\n\n${mentions} please address these items.`,
        },
      });

      // Resolve assignee agentIds for notification compat
      const assigneeAgentIds = task.assignees
        .map((a: any) => a.profile?.agentId)
        .filter(Boolean) as string[];

      await taskModel.emitRejected(task, {
        reviewerId: args.reviewerId,
        reviewerName: reviewer.name,
        assigneeIds: assigneeAgentIds,
        assigneeNames: task.assignees.map((a: any) => a.profile?.displayName ?? "Unknown"),
        rejectionReason: args.rejectionReason,
        changesNeeded: args.changesNeeded,
      });

      return {
        success: true,
        message: "Task rejected and moved back to assigned",
        newStatus: TaskStatus.ASSIGNED,
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
      const reviewer = await agentModel.findByIdOrThrow(args.reviewerId);
      if (reviewer.role !== Roles.SQUAD_LEAD) {
        throw new Error("Only Squad Lead can request clarification");
      }

      const task = await taskModel.findById(args.taskId, {
        include: {
          assignees: {
            include: { profile: { select: { agentId: true, displayName: true, username: true } } },
          },
        },
      });
      if (!task) throw new Error("Task not found");

      const questionList = args.questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
      const mentions = task.assignees
        .map((a: any) => `@${a.profile?.username ?? a.profile?.displayName ?? "unknown"}`)
        .join(" ");

      const clarifyProfileId = await getOrCreateAgentProfileId(args.reviewerId);

      await messageModel.create({
        data: {
          taskId: args.taskId,
          fromProfileId: clarifyProfileId,
          content: `**Clarification needed** from @${reviewer.username ?? reviewer.name}\n\n**Questions:**\n${questionList}\n\n${mentions} please respond.`,
        },
      });

      // Resolve assignee agentIds for notification compat
      const assigneeAgentIds = task.assignees
        .map((a: any) => a.profile?.agentId)
        .filter(Boolean) as string[];

      await taskModel.emitClarificationRequested(task, {
        reviewerId: args.reviewerId,
        reviewerName: reviewer.name,
        assigneeIds: assigneeAgentIds,
        assigneeNames: task.assignees.map((a: any) => a.profile?.displayName ?? "Unknown"),
        questions: args.questions,
      });

      return {
        success: true,
        message: "Clarification requested",
        newStatus: TaskStatus.REVIEW,
        childTaskIds: null,
      };
    },
  }),
);
