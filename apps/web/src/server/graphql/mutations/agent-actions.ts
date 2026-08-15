import { builder } from "../builder";
import { agentModel, taskModel, agentActionModel } from "../../models";
import { pubsub, PubSubEvent, agentActionAgentTopic, agentActionProjectTopic } from "../../pubsub";
import { applyAgentStatusUpdate, ACTION_TO_DETAILED_STATUS } from "../../agent-status";
import { requireRole } from "@/server/tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";

builder.mutationField("logAgentAction", (t) =>
  t.prismaField({
    type: "AgentAction",
    args: {
      agentId: t.arg.string({ required: true }),
      actionType: t.arg.string({ required: true }),
      description: t.arg.string({ required: true }),
      taskId: t.arg.string(),
      metadata: t.arg.string(), // JSON string
    },
    resolve: async (query, _root, args, ctx) => {
      requireRole(ctx, WORKSPACE_ROLES.MEMBER);
      const agent = await agentModel.findById(args.agentId);
      if (!agent) throw new Error("Agent not found");

      let projectId: string | undefined;
      if (args.taskId) {
        const task = await taskModel.findById(args.taskId, {
          select: { projectId: true },
        });
        projectId = task?.projectId ?? undefined;
      }

      const action = await agentActionModel.create({
        ...query,
        data: {
          agentId: agent.id,
          taskId: args.taskId ?? undefined,
          projectId,
          actionType: args.actionType as any,
          description: args.description,
          metadata: args.metadata ? JSON.parse(args.metadata) : undefined,
        },
      });

      const inferredStatus = ACTION_TO_DETAILED_STATUS[args.actionType];
      await applyAgentStatusUpdate(agent.id, {
        lastHeartbeat: new Date(),
        ...(inferredStatus && { detailedStatus: inferredStatus }),
      });

      const actionPayload = {
        agentId: agent.id,
        actionId: action.id,
        projectId: action.projectId ?? undefined,
      };
      pubsub.publish(agentActionAgentTopic(agent.id), actionPayload);
      if (action.projectId)
        pubsub.publish(agentActionProjectTopic(action.projectId), actionPayload);
      pubsub.publish(PubSubEvent.AGENT.ACTION_LOGGED, actionPayload);
      return action;
    },
  }),
);
