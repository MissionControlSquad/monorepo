/**
 * Per-profile analytics (member productivity/cost dashboard). DB aggregation; the pure bucketers live
 * in @agentcenter/utils. Workspace-scoped. App-data only (tasks/activity/cost) — human identity is
 * buildbase. Cost/token stats apply when the profile is an agent (profile.agentId); a human profile
 * simply has none.
 */
import { prisma } from "@/server/prisma";
import { summarizeProfileCosts, completionRate, type ProfileCostSummary } from "@agentcenter/utils";
import { TaskStatus } from "../constants";

export interface ProfileAnalytics {
  profileId: string;
  displayName: string;
  kind: string;
  agentId: string | null;
  tasksAssigned: number;
  tasksCompleted: number;
  completionRate: number;
  tasksCreated: number;
  activityCount: number;
  cost: ProfileCostSummary;
}

/** Aggregate a profile's contribution + cost within a workspace. Null if the profile doesn't exist. */
export async function getProfileAnalytics(
  workspaceId: string,
  profileId: string,
): Promise<ProfileAnalytics | null> {
  const profile = await prisma.profile.findUnique({
    where: { id: profileId },
    select: { id: true, displayName: true, kind: true, agentId: true },
  });
  if (!profile) return null;

  const inWorkspace = { project: { workspaceId } };
  const [tasksAssigned, tasksCompleted, tasksCreated, activityCount, costRows] = await Promise.all([
    prisma.task.count({ where: { ...inWorkspace, assignees: { some: { profileId } } } }),
    prisma.task.count({
      where: { ...inWorkspace, assignees: { some: { profileId } }, status: TaskStatus.DONE },
    }),
    prisma.task.count({ where: { ...inWorkspace, createdByProfileId: profileId } }),
    prisma.activity.count({ where: { profileId } }),
    profile.agentId
      ? prisma.costEvent.findMany({
          where: { workspaceId, agentId: profile.agentId },
          select: { model: true, tokensIn: true, tokensOut: true, amountCents: true },
        })
      : Promise.resolve(
          [] as {
            model: string | null;
            tokensIn: number;
            tokensOut: number;
            amountCents: number;
          }[],
        ),
  ]);

  return {
    profileId: profile.id,
    displayName: profile.displayName,
    kind: profile.kind,
    agentId: profile.agentId,
    tasksAssigned,
    tasksCompleted,
    completionRate: completionRate(tasksCompleted, tasksAssigned),
    tasksCreated,
    activityCount,
    cost: summarizeProfileCosts(costRows),
  };
}
