import { prisma } from "./prisma";
import { getOrCreateAgentProfileId } from "./agent-profile";
import { notificationModel } from "./models";
import { pubsub, notificationTopic } from "./pubsub";

/**
 * Generate due-date reminder notifications for an agent's assigned tasks.
 * Called lazily when the agent polls notifications.
 * Returns the number of reminders created.
 */
export async function generateDueDateReminders(agentId: string): Promise<number> {
  const profileId = await getOrCreateAgentProfileId(agentId);

  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Find tasks assigned to this agent that have a due date, are not deleted, and not done
  const tasks = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { not: "done" },
      dueDate: { not: null, lte: in24h },
      assignees: { some: { profileId } },
    },
    select: { id: true, title: true, dueDate: true },
  });

  if (tasks.length === 0) return 0;

  // Check for existing reminder notifications in the last 24h to dedup
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const existing = await notificationModel.findMany({
    where: {
      mentionedAgentId: agentId,
      createdAt: { gte: since },
      taskId: { in: tasks.map((t) => t.id) },
      OR: [{ content: { contains: "overdue" } }, { content: { contains: "due in" } }],
    },
    select: { taskId: true },
  });

  const alreadyNotified = new Set(existing.map((n) => n.taskId));

  let created = 0;
  for (const task of tasks) {
    if (alreadyNotified.has(task.id)) continue;

    const isOverdue = task.dueDate! < now;
    const content = isOverdue
      ? `Task "${task.title}" is overdue`
      : `Task "${task.title}" is due in less than 24 hours`;

    const notification = await notificationModel.create({
      data: { mentionedAgentId: agentId, content, taskId: task.id },
    });
    pubsub.publish(notificationTopic(agentId), {
      agentId,
      notificationId: notification.id,
    });
    created++;
  }

  return created;
}
