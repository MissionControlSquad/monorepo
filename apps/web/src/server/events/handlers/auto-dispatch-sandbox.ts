/**
 * Auto-dispatch (Tier D): when a task gains an assignee that is a sandbox-bound AGENT, enqueue a
 * background sandbox run for it. RUNNERS-gated + deduped inside the service. Failures isolated by the
 * bus (allSettled).
 */
import { on } from "../bus";
import { EventTypes } from "../../constants";
import { autoDispatchSandboxForAssignment } from "../../services/sandbox-run";

on(EventTypes.TASK_ASSIGNEES_CHANGED, async (event) => {
  if (event.addedIds.length === 0) return;
  await autoDispatchSandboxForAssignment(event.taskId, event.addedIds);
});
