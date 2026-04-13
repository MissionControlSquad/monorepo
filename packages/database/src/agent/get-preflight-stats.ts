/**
 * @agentcenter/database - Agent Operations
 *
 * Aggregate stats for the agent heartbeat-preflight endpoint.
 * Returns counts used to determine if the agent should wake up / pick up work.
 */

import { prisma, notDeleted } from "../client";
import { TaskStatus } from "@agentcenter/utils";

export interface AgentPreflightStats {
  activeTaskAssignments: number;
  inboxTaskCount: number;
  reviewTaskCount: number;
  unreadChannelMessages: number;
  undeliveredMentions: number;
}

export async function getAgentPreflightStats(
  profileId: string,
  agentId: string,
  projectIds: string[],
): Promise<AgentPreflightStats> {
  const [
    activeTaskAssignments,
    inboxTaskCount,
    reviewTaskCount,
    channelMemberships,
    undeliveredMentions,
  ] = await Promise.all([
    // Active task assignments for this agent's profile
    prisma.taskAssignee.count({
      where: {
        profileId,
        task: { status: { notIn: [TaskStatus.DONE] }, ...notDeleted },
      },
    }),

    // Inbox tasks visible to this agent (by project or unassigned)
    prisma.task.count({
      where: {
        status: TaskStatus.INBOX,
        ...notDeleted,
        OR: [
          ...(projectIds.length > 0 ? [{ projectId: { in: projectIds } }] : []),
          { projectId: null },
        ],
      },
    }),

    // Tasks in review visible to this agent
    prisma.task.count({
      where: {
        status: TaskStatus.REVIEW,
        ...notDeleted,
        ...(projectIds.length > 0 ? { projectId: { in: projectIds } } : {}),
      },
    }),

    // Channel memberships for unread-count aggregation
    prisma.channelMember.findMany({
      where: { profileId },
      select: { channelId: true, lastReadAt: true, joinedAt: true },
    }),

    // Undelivered @mention notifications
    prisma.notification.count({
      where: { mentionedAgentId: agentId, delivered: false },
    }),
  ]);

  // Count total unread channel messages across all memberships
  const unreadChannelMessages =
    channelMemberships.length > 0
      ? await prisma.channelMessage.count({
          where: {
            OR: channelMemberships.map((m) => ({
              channelId: m.channelId,
              createdAt: { gt: m.lastReadAt ?? m.joinedAt },
              fromProfileId: { not: profileId },
            })),
          },
        })
      : 0;

  return {
    activeTaskAssignments,
    inboxTaskCount,
    reviewTaskCount,
    unreadChannelMessages,
    undeliveredMentions,
  };
}
