import { on } from "../bus";
import { EventTypes, TaskStatus } from "../../constants";
import { wakeDependentsOf } from "../../services/dependency-wakeups";

// When a task reaches a terminal status, wake the tasks it was blocking (parity #1, TASK_AUTONOMY-gated).
// Waking moves a task `blocked` → `inbox`, which re-emits TASK_STATUS_CHANGED with toStatus=inbox —
// not a terminal status, so this handler never re-triggers on its own output (no loop).
on(EventTypes.TASK_STATUS_CHANGED, async (e) => {
  if (e.toStatus === TaskStatus.DONE || e.toStatus === TaskStatus.CANCELLED) {
    await wakeDependentsOf(e.taskId);
  }
});
