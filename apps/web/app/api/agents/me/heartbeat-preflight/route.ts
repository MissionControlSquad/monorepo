import { resolveAgent } from "../../../_lib/resolve-agent";
import { successResponse, handleError } from "../../../_lib/json-response";
import { log } from "../../../_lib/logger";
import { isSystemShutdown } from "@/server/system-settings";
import { CURRENT_CONFIG_VERSION } from "@/server/config-version";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { getAgentProjectIds } from "../../../_lib/project-access";
import { Roles } from "@/server/constants";
import { prisma } from "@/server/prisma";
import { applyAgentStatusUpdate } from "@/server/agent-status";

/**
 * GET /api/agents/me/heartbeat-preflight
 *
 * Lightweight check for agents to decide whether a full heartbeat is needed.
 * Returns boolean flags so the agent can short-circuit idle cycles without
 * loading PLAYBOOK.md or making multiple API calls.
 */
export async function GET(request: Request) {
  try {
    const agent = await resolveAgent(request);

    // Short-circuit: shutdown
    const shutdown = await isSystemShutdown();
    if (shutdown) {
      log("preflight", `agent="${agent.name}" shouldWork=false reason=shutdown`, request);
      return successResponse({
        shouldWork: false,
        shutdown: true,
        vacation: false,
        overlapping: false,
        hasAssignedTasks: false,
        hasInboxTasks: false,
        hasUnreadMessages: false,
        hasNotifications: false,
        hasPendingReview: false,
        upgradeAvailable: false,
      });
    }

    // Short-circuit: vacation
    if (agent.isOnVacation) {
      log("preflight", `agent="${agent.name}" shouldWork=false reason=vacation`, request);
      return successResponse({
        shouldWork: false,
        shutdown: false,
        vacation: true,
        overlapping: false,
        hasAssignedTasks: false,
        hasInboxTasks: false,
        hasUnreadMessages: false,
        hasNotifications: false,
        hasPendingReview: false,
        upgradeAvailable: false,
      });
    }

    // Check for overlapping session (currentTaskId set + recent heartbeat)
    const overlapping =
      !!agent.currentTaskId &&
      !!agent.lastHeartbeat &&
      Date.now() - new Date(agent.lastHeartbeat).getTime() < 5 * 60 * 1000;

    if (overlapping) {
      log("preflight", `agent="${agent.name}" shouldWork=false reason=overlapping`, request);
      return successResponse({
        shouldWork: false,
        shutdown: false,
        vacation: false,
        overlapping: true,
        hasAssignedTasks: false,
        hasInboxTasks: false,
        hasUnreadMessages: false,
        hasNotifications: false,
        hasPendingReview: false,
        upgradeAvailable: false,
      });
    }

    // Update lastHeartbeat so the agent shows as "online" in the UI
    // even when preflight says there's no work. Fire-and-forget to keep response fast.
    applyAgentStatusUpdate(agent.id, { lastHeartbeat: new Date() });

    // Run all checks in parallel
    const profileId = await getOrCreateAgentProfileId(agent.id);
    const projectIds = await getAgentProjectIds(agent.id);

    const [assignedCount, inboxCount, unreadCount, notificationCount, pendingReviewCount] =
      await Promise.all([
        // Assigned tasks (non-done, non-deleted)
        prisma.taskAssignee.count({
          where: {
            profileId,
            task: {
              status: { notIn: ["done"] },
              deletedAt: null,
            },
          },
        }),

        // Inbox tasks across agent's projects (+ unscoped)
        prisma.task.count({
          where: {
            status: "inbox",
            deletedAt: null,
            OR: [
              ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
              { projectId: null },
            ],
          },
        }),

        // Unread messages: check if ANY channel has messages newer than lastReadAt
        (async () => {
          const memberships = await prisma.channelMember.findMany({
            where: { profileId },
            select: { channelId: true, lastReadAt: true },
          });
          if (memberships.length === 0) return 0;

          // Single query: check all channels at once using OR conditions
          const orConditions = memberships.map((m) => ({
            channelId: m.channelId,
            ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
            fromProfileId: { not: profileId },
          }));

          const unreadCount = await prisma.channelMessage.count({
            where: { OR: orConditions },
            take: 1,
          });
          return unreadCount > 0 ? 1 : 0;
        })(),

        // Undelivered notifications
        prisma.notification.count({
          where: {
            mentionedAgentId: agent.id,
            delivered: false,
          },
        }),

        // Pending review tasks (lead agents only)
        agent.role === Roles.SQUAD_LEAD
          ? prisma.task.count({
              where: {
                status: "review",
                deletedAt: null,
                ...(projectIds.length > 0 ? { projectId: { in: projectIds } } : {}),
              },
            })
          : 0,
      ]);

    // Config upgrade available?
    const upgradeAvailable =
      !!agent.configVersion && agent.configVersion !== CURRENT_CONFIG_VERSION;

    const hasAssignedTasks = assignedCount > 0;
    const hasInboxTasks = inboxCount > 0;
    const hasUnreadMessages = unreadCount > 0;
    const hasNotifications = notificationCount > 0;
    const hasPendingReview = pendingReviewCount > 0;

    const shouldWork =
      hasAssignedTasks ||
      hasInboxTasks ||
      hasUnreadMessages ||
      hasNotifications ||
      hasPendingReview ||
      upgradeAvailable;

    log(
      "preflight",
      `agent="${agent.name}" shouldWork=${shouldWork} assigned=${assignedCount} inbox=${inboxCount} unread=${unreadCount} notifications=${notificationCount} review=${pendingReviewCount}`,
      request,
    );
    return successResponse({
      shouldWork,
      shutdown: false,
      vacation: false,
      overlapping: false,
      hasAssignedTasks,
      hasInboxTasks,
      hasUnreadMessages,
      hasNotifications,
      hasPendingReview,
      upgradeAvailable,
    });
  } catch (err) {
    return handleError(err);
  }
}
