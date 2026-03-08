import { on } from "../bus";
import { EventTypes, TaskStatus } from "../../constants";
import { clearCurrentTaskForAgentsWithTask } from "../../agent-status";

// Clean up references when a task is deleted
on(EventTypes.TASK_DELETED, async (e) => {
  if (e.type !== EventTypes.TASK_DELETED) return;
  await clearCurrentTaskForAgentsWithTask(e.taskId);
});

// When a task is completed or moved to review, clear it from any agent's currentTaskId
// so they are no longer "working on" that task and can pick up new work
on(EventTypes.TASK_STATUS_CHANGED, async (e) => {
  if (e.type !== EventTypes.TASK_STATUS_CHANGED) return;
  if (e.toStatus === TaskStatus.DONE || e.toStatus === TaskStatus.REVIEW) {
    await clearCurrentTaskForAgentsWithTask(e.taskId);
  }
});
