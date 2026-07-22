import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { PluginLocalFolder } from "@agentcenter/database";
import { normalizePortable } from "@agentcenter/utils";

// Plugin local folders (parity #116). Dev-mode registry of local plugin-source folders. The registry +
// enable/disable live here; the dev-watcher (#106, infra) hot-reloads enabled folders. Workspace-scoped;
// admin-gated at the resolver (registering a local path is a privileged dev action).

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export async function registerLocalFolder(input: {
  workspaceId: string;
  path: string;
  label?: string | null;
  createdByProfileId?: string | null;
}): Promise<PluginLocalFolder> {
  const raw = input.path?.trim();
  if (!raw) badRequest("path is required");
  const path = normalizePortable(raw);
  return prisma.pluginLocalFolder.upsert({
    where: { workspaceId_path: { workspaceId: input.workspaceId, path } },
    create: {
      workspaceId: input.workspaceId,
      path,
      label: input.label ?? null,
      createdByProfileId: input.createdByProfileId ?? null,
    },
    update: { label: input.label ?? null },
  });
}

export function listLocalFolders(
  workspaceId: string,
  enabledOnly = false,
): Promise<PluginLocalFolder[]> {
  return prisma.pluginLocalFolder.findMany({
    where: { workspaceId, ...(enabledOnly ? { enabled: true } : {}) },
    orderBy: { path: "asc" },
  });
}

export async function setLocalFolderEnabled(
  workspaceId: string,
  id: string,
  enabled: boolean,
): Promise<PluginLocalFolder> {
  const { count } = await prisma.pluginLocalFolder.updateMany({
    where: { id, workspaceId },
    data: { enabled },
  });
  if (count === 0) badRequest("Local folder not found");
  return (await prisma.pluginLocalFolder.findFirst({ where: { id, workspaceId } }))!;
}

/** Record a load attempt (the dev-watcher reports success/failure back here). */
export async function recordLocalFolderLoad(
  workspaceId: string,
  id: string,
  error?: string | null,
): Promise<void> {
  await prisma.pluginLocalFolder.updateMany({
    where: { id, workspaceId },
    data: { lastLoadedAt: new Date(), lastError: error ? error.slice(0, 2000) : null },
  });
}

export async function removeLocalFolder(workspaceId: string, id: string): Promise<boolean> {
  const { count } = await prisma.pluginLocalFolder.deleteMany({ where: { id, workspaceId } });
  return count > 0;
}
