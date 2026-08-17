import { agentModel, taskModel } from "@/server/models";
import { pubsub, PubSubEvent, taskTopic } from "@/server/pubsub";
import { TaskStatus, Priority } from "@/server/constants";
import { UPGRADE_CONFIG_TASK } from "@/server/upgrade-task";
import { withTenancy } from "../../../_lib/rest-tenancy";
import { WORKSPACE_ROLES } from "@agentcenter/graphql-server";
import {
  errorResponse,
  successResponse,
  handleError,
  assertFound,
} from "../../../_lib/json-response";
import { ERR } from "../../../_lib/error-messages";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { assertAssignableAgents } from "@/server/assignment-guard";
import type { RouteContext } from "../../../_lib/route-context";

/**
 * POST /api/agents/:id/request-config-upgrade
 * Creates a high-priority task assigned to this agent to upgrade their config (compare, report, apply).
 * Human ADMIN only (previously unauthenticated). Used by the dashboard "Ask agent to patch" button.
 * Agents live in this tenant's own isolated database.
 */
export const POST = withTenancy(
  async (_request, _tenancy, ctx: RouteContext) => {
    try {
      const { id } = await ctx.params;
      const agent = await agentModel.findById(id);
      assertFound(agent, ERR.AGENT_NOT_FOUND);

      try {
        await assertAssignableAgents([agent.id]);
      } catch (e: any) {
        return errorResponse(e.message, 400);
      }

      const profileId = await getOrCreateAgentProfileId(agent.id);
      const task = await taskModel.create({
        data: {
          title: UPGRADE_CONFIG_TASK.title,
          description: UPGRADE_CONFIG_TASK.description,
          status: TaskStatus.INBOX,
          priority: Priority.HIGH,
          projectId: null,
          assignees: {
            create: [{ profileId }],
          },
        },
        include: { assignees: { include: { profile: true } } },
      });

      await taskModel.emitCreated(task, {
        createdBy: undefined,
        creatorName: undefined,
        assigneeIds: [agent.id],
        fromDashboard: true,
      });

      pubsub.publish(taskTopic(task.id), { taskId: task.id, projectId: undefined });
      pubsub.publish(PubSubEvent.TASK.UPDATED, { taskId: task.id, projectId: undefined });
      return successResponse({ task }, 201);
    } catch (err) {
      return handleError(err);
    }
  },
  { minRole: WORKSPACE_ROLES.ADMIN },
);
