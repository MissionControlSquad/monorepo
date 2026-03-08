import { on } from "../bus";
import { invalidateSubscribers } from "../../cache";
import { EventTypes } from "../../constants";
import { subscriptionModel, agentModel } from "../../models";
import { applyAgentStatusUpdate } from "../../agent-status";

async function subscribe(agentId: string, taskId: string) {
  await subscriptionModel.delegate.upsert({
    where: { agentId_taskId: { agentId, taskId } },
    create: { agentId, taskId },
    update: {},
  });
}

// Subscribe assignees and creator on task creation
on(EventTypes.TASK_CREATED, async (e) => {
  if (e.type !== EventTypes.TASK_CREATED) return;
  const ids = [...e.assigneeIds];
  if (e.createdBy && !ids.includes(e.createdBy)) ids.push(e.createdBy);
  await Promise.all(ids.map((agentId) => subscribe(agentId, e.taskId)));
  invalidateSubscribers(e.taskId);
});

// Subscribe newly added assignees, unsubscribe removed
on(EventTypes.TASK_ASSIGNEES_CHANGED, async (e) => {
  if (e.type !== EventTypes.TASK_ASSIGNEES_CHANGED) return;

  await Promise.all([
    ...e.addedIds.map((agentId) => subscribe(agentId, e.taskId)),
    ...e.removedIds.map((agentId) =>
      subscriptionModel.deleteMany({
        where: { agentId, taskId: e.taskId },
      }),
    ),
  ]);
  invalidateSubscribers(e.taskId);

  // Clear currentTask from unassigned agents (only those whose current task was this one)
  const toClear = await agentModel.delegate.findMany({
    where: { id: { in: e.removedIds }, currentTaskId: e.taskId },
    select: { id: true },
  });
  await Promise.all(
    toClear.map((a) => applyAgentStatusUpdate(a.id, { currentTaskId: null, currentTask: null })),
  );
});

// Subscribe message author and mentioned agents
on(EventTypes.MESSAGE_CREATED, async (e) => {
  if (e.type !== EventTypes.MESSAGE_CREATED) return;
  const ids = [...(e.fromAgentId ? [e.fromAgentId] : []), ...e.mentionedAgentIds];
  await Promise.all([...new Set(ids)].map((agentId) => subscribe(agentId, e.taskId)));
  invalidateSubscribers(e.taskId);
});
