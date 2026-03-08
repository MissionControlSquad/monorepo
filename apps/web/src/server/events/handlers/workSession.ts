import { on } from "../bus";
import { EventTypes, TaskStatus } from "../../constants";
import { workSessionModel } from "../../models";

// End active work sessions when task is completed
on(EventTypes.TASK_STATUS_CHANGED, async (e) => {
  if (e.type !== EventTypes.TASK_STATUS_CHANGED) return;
  if (e.toStatus !== TaskStatus.DONE) return;

  const activeSessions = await workSessionModel.findMany({
    where: { taskId: e.taskId, endedAt: null },
  });

  const now = new Date();
  await Promise.all(
    activeSessions.map((session) =>
      workSessionModel.update(session.id, {
        data: {
          endedAt: now,
          duration: now.getTime() - session.startedAt.getTime(),
        },
      }),
    ),
  );
});

// End active work sessions when task is deleted
on(EventTypes.TASK_DELETED, async (e) => {
  if (e.type !== EventTypes.TASK_DELETED) return;

  const activeSessions = await workSessionModel.findMany({
    where: { taskId: e.taskId, endedAt: null },
  });

  const now = new Date();
  await Promise.all(
    activeSessions.map((session) =>
      workSessionModel.update(session.id, {
        data: {
          endedAt: now,
          duration: now.getTime() - session.startedAt.getTime(),
        },
      }),
    ),
  );
});
