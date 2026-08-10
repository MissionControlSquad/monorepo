import { prisma } from "@/server/prisma";
import type { CloudUpstream } from "@agentcenter/database";
import { planUpstreamSync, type UpstreamSyncPlan } from "@agentcenter/utils";
import { badRequest } from "./service-errors";

// Cloud upstreams (parity #24). Manage a project's remote fork/sync config and record the drift state a
// git host reports. planSync classifies the current comparison into an action; performing that action
// (fetch/merge/push) is the infra-gated git op done elsewhere and reported back via recordSyncResult.
// Workspace-scoped; mutations admin-gated at the resolver.

export async function upsertCloudUpstream(input: {
  workspaceId: string;
  projectId: string;
  name: string;
  remoteUrl: string;
  remoteRef?: string;
  createdByProfileId?: string | null;
}): Promise<CloudUpstream> {
  if (!input.name?.trim()) badRequest("name is required");
  if (!input.projectId?.trim()) badRequest("projectId is required");
  if (!/^https?:\/\/|^git@/.test(input.remoteUrl ?? ""))
    badRequest("remoteUrl must be an http(s) or git URL");
  const data = { remoteUrl: input.remoteUrl, remoteRef: input.remoteRef ?? "main" };
  return prisma.cloudUpstream.upsert({
    where: {
      workspaceId_projectId_name: {
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        name: input.name.trim(),
      },
    },
    create: {
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      name: input.name.trim(),
      createdByProfileId: input.createdByProfileId ?? null,
      ...data,
    },
    update: data,
  });
}

export function listCloudUpstreams(
  workspaceId: string,
  projectId?: string,
): Promise<CloudUpstream[]> {
  return prisma.cloudUpstream.findMany({
    where: { workspaceId, ...(projectId ? { projectId } : {}) },
    orderBy: { updatedAt: "desc" },
  });
}

/** The current sync plan for an upstream, from its last-observed comparison. */
export async function planSync(workspaceId: string, id: string): Promise<UpstreamSyncPlan> {
  const up = await prisma.cloudUpstream.findFirst({ where: { id, workspaceId } });
  if (!up) badRequest("Upstream not found");
  return planUpstreamSync({
    localSha: up.localSha,
    remoteSha: up.remoteSha,
    ahead: up.ahead,
    behind: up.behind,
  });
}

/**
 * Record the result of an out-of-band comparison/sync (the git op reports back here): update the shas +
 * ahead/behind, recompute the sync state, and stamp lastSyncedAt (or lastError on failure).
 */
export async function recordSyncResult(
  workspaceId: string,
  id: string,
  result: {
    localSha?: string | null;
    remoteSha?: string | null;
    ahead?: number;
    behind?: number;
    error?: string | null;
  },
): Promise<CloudUpstream> {
  const up = await prisma.cloudUpstream.findFirst({ where: { id, workspaceId } });
  if (!up) badRequest("Upstream not found");
  if (result.error) {
    return prisma.cloudUpstream.update({
      where: { id },
      data: { lastError: result.error.slice(0, 2000) },
    });
  }
  const ahead = result.ahead ?? up.ahead;
  const behind = result.behind ?? up.behind;
  const plan = planUpstreamSync({
    localSha: result.localSha ?? up.localSha,
    remoteSha: result.remoteSha ?? up.remoteSha,
    ahead,
    behind,
  });
  return prisma.cloudUpstream.update({
    where: { id },
    data: {
      localSha: result.localSha ?? up.localSha,
      remoteSha: result.remoteSha ?? up.remoteSha,
      ahead,
      behind,
      syncState: plan.state,
      lastError: null,
      lastSyncedAt: new Date(),
    },
  });
}

export async function deleteCloudUpstream(workspaceId: string, id: string): Promise<boolean> {
  const { count } = await prisma.cloudUpstream.deleteMany({ where: { id, workspaceId } });
  return count > 0;
}
