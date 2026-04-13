/**
 * mention-auto-assign.ts
 *
 * When a Squad Lead @mentions an agent in a task's chat, automatically:
 *  1. Assigns that agent to the task (if not already).
 *  2. Adds them to the task's project as an active member (if not already).
 *  3. Emits TASK_ASSIGNEES_CHANGED so all downstream handlers fire:
 *     notifications, live delivery, activity log, subscriptions.
 *
 * Called synchronously BEFORE MESSAGE_CREATED is emitted from both the
 * REST route and GraphQL mutation, so that the mention notification handler
 * already sees the correct assignment state when it checks it.
 *
 * Rules:
 *  - Only Squad Leaders trigger auto-assignment — regular agent mentions are not auto-assigned.
 *  - Non-destructive: only adds assignees, never removes existing ones.
 *  - Never throws — all errors are caught and logged.
 */

import { Roles } from "../constants";
import { getOrCreateAgentProfileId } from "../agent-profile";
import { taskModel } from "../models";

export interface MentionAutoAssignOpts {
  taskId: string;
  fromAgentId: string;
  mentionedAgentIds: string[];
}

/**
 * Auto-assigns mentioned agents to the task when the sender is a Squad Lead.
 * Returns the agentIds that were newly assigned (empty array if nothing changed).
 * Never throws.
 */
export async function tryMentionAutoAssign(opts: MentionAutoAssignOpts): Promise<string[]> {
  if (!opts.mentionedAgentIds.length) return [];

  try {
    const { prisma } = await import("../prisma");

    // Only Squad Leaders trigger auto-assignment via mentions.
    const sender = await prisma.agent
      .findUnique({ where: { id: opts.fromAgentId }, select: { role: true } })
      .catch(() => null);
    if (sender?.role !== Roles.SQUAD_LEAD) return [];

    // Load the task — need full fields to emit the assignees-changed event downstream.
    const task = await prisma.task
      .findUnique({
        where: { id: opts.taskId },
        select: {
          id: true,
          taskNumber: true,
          title: true,
          description: true,
          priority: true,
          projectId: true,
        },
      })
      .catch(() => null);
    if (!task) return [];

    // Current assignee profileIds — used to skip already-assigned agents.
    const existing = await prisma.taskAssignee
      .findMany({ where: { taskId: opts.taskId }, select: { profileId: true } })
      .catch(() => []);
    const existingProfileIds = new Set(existing.map((a) => a.profileId));

    // Resolve mentioned agents and their profiles.
    const agents = await prisma.agent
      .findMany({
        where: { id: { in: opts.mentionedAgentIds } },
        select: { id: true, name: true, profile: { select: { id: true } } },
      })
      .catch(() => []);

    const toAssign: Array<{ agentId: string; profileId: string; name: string }> = [];
    for (const agent of agents) {
      // Use existing profile or create one on the fly.
      const profileId =
        agent.profile?.id ??
        (await getOrCreateAgentProfileId(agent.id).catch((err) => {
          console.error(
            `[mention-auto-assign] Failed to resolve profile for agent ${agent.id} ("${agent.name}"):`,
            err,
          );
          return null;
        }));
      if (!profileId) continue;
      if (existingProfileIds.has(profileId)) continue; // already assigned — skip
      toAssign.push({ agentId: agent.id, profileId, name: agent.name });
    }

    if (!toAssign.length) return [];

    // Add task assignees — non-destructive (skipDuplicates, no deleteMany).
    await prisma.taskAssignee
      .createMany({
        data: toAssign.map(({ profileId }) => ({ taskId: opts.taskId, profileId })),
        skipDuplicates: true,
      })
      .catch(() => undefined);

    // Ensure each newly-assigned agent is an active member of the task's project.
    if (task.projectId) {
      await Promise.all(
        toAssign.map(({ profileId }) =>
          prisma.projectMember
            .upsert({
              where: { projectId_profileId: { projectId: task.projectId!, profileId } },
              create: { projectId: task.projectId!, profileId },
              update: { status: "active" },
            })
            .catch(() => undefined),
        ),
      );
    }

    // Emit TASK_ASSIGNEES_CHANGED — triggers: mention/task notifications, live delivery,
    // activity log, subscription updates, and user-facing notifications.
    await taskModel.emitAssigneesChanged(task, {
      addedIds: toAssign.map((a) => a.agentId),
      removedIds: [],
      addedNames: toAssign.map((a) => a.name),
      removedNames: [],
    });

    console.log(
      `[mention-auto-assign] Squad Lead auto-assigned [${toAssign.map((a) => a.name).join(", ")}] to task ${opts.taskId}`,
    );

    return toAssign.map((a) => a.agentId);
  } catch (err) {
    console.error("[mention-auto-assign] Failed:", err);
    return [];
  }
}
