import { on } from "../bus";
import { pubsub, notificationTopic } from "../../pubsub";
import { subscriberCache } from "../../cache";
import { EventTypes } from "../../constants";
import { notificationModel, subscriptionModel } from "../../models";
import {
  tryDeliverMentionNotification,
  tryDeliverTaskToLiveAgents,
  tryDeliverInboxTaskNotification,
  tryDeliverReviewNotification,
  tryDeliverTaskApprovedNotification,
  tryDeliverTaskRejectedNotification,
  tryDeliverClarificationNotification,
} from "../../services/live-task-delivery";

async function notify(
  mentionedAgentId: string,
  content: string,
  taskId?: string,
  messageId?: string,
) {
  try {
    const notification = await notificationModel.create({
      data: { mentionedAgentId, content, taskId, messageId },
    });
    pubsub.publish(notificationTopic(mentionedAgentId), {
      agentId: mentionedAgentId,
      notificationId: notification.id,
    });
    return notification;
  } catch (err) {
    console.error("[notification] Failed to create notification:", {
      mentionedAgentId,
      taskId,
      messageId,
      err,
    });
    throw err;
  }
}

async function getSubscriberIds(taskId: string): Promise<string[]> {
  let ids = subscriberCache.get(taskId);
  if (!ids) {
    const subscriptions = await subscriptionModel.findMany({
      where: { taskId },
      select: { agentId: true },
    });
    ids = subscriptions.map((s) => s.agentId);
    subscriberCache.set(taskId, ids);
  }
  return ids;
}

// Notify assignees when assigned to a new task (dashboard, API, or template)
on(EventTypes.TASK_CREATED, async (e) => {
  if (e.assigneeIds?.length) {
    await Promise.all(
      e.assigneeIds.map((agentId) =>
        notify(
          agentId,
          `You were assigned to task "${e.title}"${e.creatorName ? ` by ${e.creatorName}` : ""}`,
          e.taskId,
        ),
      ),
    );

    // Live gateway: push task delivery immediately to connected agents.
    // Fire-and-forget — LivePendingDelivery queue handles durability + reconnect drain.
    tryDeliverTaskToLiveAgents(e.assigneeIds, {
      taskId: e.taskId,
      taskTitle: e.title,
      taskDescription: e.description,
      priority: e.priority ?? "medium",
      assignedBy: e.creatorName,
    }).catch(() => undefined);
  } else if (e.projectId) {
    // Unassigned inbox task — notify all active project agents so they can pick it up.
    // idempotency: REST POST also calls this directly; duplicate is safe (no-op on miss).
    tryDeliverInboxTaskNotification(e.taskId, e.projectId, e.title).catch(() => undefined);
  }
});

on(EventTypes.TASK_ASSIGNEES_CHANGED, async (e) => {
  await Promise.all([
    ...e.addedIds.map((agentId) =>
      notify(agentId, `You were added to task "${e.title}"`, e.taskId),
    ),
    ...e.removedIds.map((agentId) =>
      notify(agentId, `You were removed from task "${e.title}"`, e.taskId),
    ),
  ]);

  // Live gateway: push task delivery to newly added assignees.
  // idempotency key in enqueuePendingDelivery prevents double-delivery if REST path
  // also called tryDeliverTaskToLiveAgents directly for the same task+agent.
  if (e.addedIds.length > 0) {
    tryDeliverTaskToLiveAgents(e.addedIds, {
      taskId: e.taskId,
      taskTitle: e.title,
      taskDescription: e.description,
      priority: e.priority ?? "medium",
    }).catch(() => undefined);
  }
});

// Notify subscribers when task status changes
on(EventTypes.TASK_STATUS_CHANGED, async (e) => {
  const subscriberIds = await getSubscriberIds(e.taskId);

  await Promise.all(
    subscriberIds
      .filter((id) => id !== e.changedBy)
      .map((id) => notify(id, `Task "${e.title}" moved to ${e.toStatus}`, e.taskId)),
  );

  // Live gateway: notify squad leads when task enters review.
  // Covers GraphQL updateTask path — REST PATCH already calls this directly.
  if (e.toStatus === "review") {
    tryDeliverReviewNotification(e.taskId, e.projectId ?? null, e.title).catch(() => undefined);
  }
});

// Notify mentioned agents
on(EventTypes.MESSAGE_CREATED, async (e) => {
  await Promise.all(
    e.mentionedAgentIds.map((agentId) =>
      notify(
        agentId,
        `${e.fromAgentName} mentioned you in "${e.taskTitle}"`,
        e.taskId,
        e.messageId,
      ),
    ),
  );

  // Live gateway: push mention notification immediately to connected agents.
  // Fire-and-forget — heartbeat is the fallback for offline agents.
  if (e.mentionedAgentIds.length > 0) {
    tryDeliverMentionNotification(e.mentionedAgentIds, {
      fromName: e.fromAgentName,
      taskTitle: e.taskTitle,
      taskId: e.taskId,
      messageId: e.messageId,
    }).catch(() => undefined);
  }

  // Notify subscribers (excluding sender and mentioned)
  const msgSubscriberIds = await getSubscriberIds(e.taskId);

  const mentionedSet = new Set(e.mentionedAgentIds);
  await Promise.all(
    msgSubscriberIds
      .filter((id) => (!e.fromAgentId || id !== e.fromAgentId) && !mentionedSet.has(id))
      .map((id) =>
        notify(id, `${e.fromAgentName} commented on "${e.taskTitle}"`, e.taskId, e.messageId),
      ),
  );
});

on(EventTypes.DOCUMENT_CREATED, async (e) => {
  if (!e.taskId) return;
  const docSubscriberIds = await getSubscriberIds(e.taskId);

  await Promise.all(
    docSubscriberIds
      .filter((id) => id !== e.createdBy)
      .map((id) =>
        notify(
          id,
          `${e.creatorName} added ${e.docType} "${e.title}" to "${e.taskTitle}"`,
          e.taskId,
        ),
      ),
  );
});

// Review notifications
on(EventTypes.TASK_APPROVED, async (e) => {
  await Promise.all(
    e.assigneeIds.map((agentId) =>
      notify(agentId, `Your task "${e.title}" was approved by ${e.reviewerName}`, e.taskId),
    ),
  );

  tryDeliverTaskApprovedNotification(e.assigneeIds, {
    taskTitle: e.title,
    taskId: e.taskId,
    reviewerName: e.reviewerName,
  }).catch(() => undefined);
});

on(EventTypes.TASK_REJECTED, async (e) => {
  await Promise.all(
    e.assigneeIds.map((agentId) =>
      notify(
        agentId,
        `Your task "${e.title}" was rejected by ${e.reviewerName}: ${e.rejectionReason}`,
        e.taskId,
      ),
    ),
  );

  tryDeliverTaskRejectedNotification(e.assigneeIds, {
    taskTitle: e.title,
    taskId: e.taskId,
    reviewerName: e.reviewerName,
    rejectionReason: e.rejectionReason,
  }).catch(() => undefined);
});

on(EventTypes.TASK_CLARIFICATION_REQUESTED, async (e) => {
  await Promise.all(
    e.assigneeIds.map((agentId) =>
      notify(agentId, `${e.reviewerName} requested clarification on "${e.title}"`, e.taskId),
    ),
  );

  tryDeliverClarificationNotification(e.assigneeIds, {
    taskTitle: e.title,
    taskId: e.taskId,
    reviewerName: e.reviewerName,
    questions: e.questions,
  }).catch(() => undefined);
});
