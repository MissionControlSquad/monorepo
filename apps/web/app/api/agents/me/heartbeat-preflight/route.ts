import { withAgent } from "../../../_lib/with-agent";
import { successResponse } from "../../../_lib/json-response";
import { log } from "../../../_lib/logger";
import { isSystemShutdown } from "@/server/system-settings";
import { CURRENT_CONFIG_VERSION } from "@/server/config-version";
import { getOrCreateAgentProfileId } from "@/server/agent-profile";
import { getAgentProjectIds, isSquadLead } from "../../../_lib/project-access";
import { getAgentPreflightStats } from "@agentcenter/database";
import { applyAgentStatusUpdate } from "@/server/agent-status";

/**
 * GET /api/agents/me/heartbeat-preflight
 *
 * Lightweight check for agents to decide whether a full heartbeat is needed.
 * Returns boolean flags so the agent can short-circuit idle cycles without
 * loading PLAYBOOK.md or making multiple API calls.
 */
export const GET = withAgent(async (request, agent) => {
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
    // Still check for unread DMs so the agent picks them up as soon as
    // the concurrent session finishes and overlapping clears.
    const profileIdForOverlap = await getOrCreateAgentProfileId(agent.id);
    const projectIdsForOverlap = await getAgentProjectIds(agent.id);
    const { unreadChannelMessages: overlapUnread } = await getAgentPreflightStats(
      profileIdForOverlap,
      agent.id,
      projectIdsForOverlap,
    );
    log(
      "preflight",
      `agent="${agent.name}" shouldWork=false reason=overlapping unread=${overlapUnread}`,
      request,
    );
    return successResponse({
      shouldWork: false,
      shutdown: false,
      vacation: false,
      overlapping: true,
      hasAssignedTasks: false,
      hasInboxTasks: false,
      hasUnreadMessages: overlapUnread > 0,
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

  const {
    activeTaskAssignments,
    inboxTaskCount,
    reviewTaskCount,
    unreadChannelMessages,
    undeliveredMentions,
  } = await getAgentPreflightStats(profileId, agent.id, projectIds);

  // Config upgrade available?
  const upgradeAvailable = !!agent.configVersion && agent.configVersion !== CURRENT_CONFIG_VERSION;

  const hasAssignedTasks = activeTaskAssignments > 0;
  const hasInboxTasks = inboxTaskCount > 0;
  const hasUnreadMessages = unreadChannelMessages > 0;
  const hasNotifications = undeliveredMentions > 0;
  const hasPendingReview = isSquadLead(agent) && reviewTaskCount > 0;

  const shouldWork =
    hasAssignedTasks ||
    hasInboxTasks ||
    hasUnreadMessages ||
    hasNotifications ||
    hasPendingReview ||
    upgradeAvailable;

  log(
    "preflight",
    `agent="${agent.name}" shouldWork=${shouldWork} assigned=${activeTaskAssignments} inbox=${inboxTaskCount} unread=${unreadChannelMessages} notifications=${undeliveredMentions} review=${reviewTaskCount}`,
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
});
