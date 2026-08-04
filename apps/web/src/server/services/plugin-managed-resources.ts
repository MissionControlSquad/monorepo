import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { PluginManagedResource } from "@agentcenter/database";

// Plugin-managed resources (parity #118 agents / #119 routines / #120 skills). Records which platform
// entities a plugin owns, so uninstall can clean them up and two plugins can't claim the same resource.
// Workspace-scoped. The runtime that actually creates/deletes the underlying agent/routine/skill is
// separate; this is the ownership ledger.

const RESOURCE_TYPES = new Set(["agent", "routine", "skill"]);

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

/** Register a resource as managed by a plugin. Rejects a resource already owned by another plugin. */
export async function registerManagedResource(input: {
  workspaceId: string;
  pluginId: string;
  resourceType: string;
  resourceId: string;
  externalRef?: string | null;
  metadata?: unknown;
}): Promise<PluginManagedResource> {
  if (!RESOURCE_TYPES.has(input.resourceType))
    badRequest("resourceType must be one of: agent, routine, skill");

  const existing = await prisma.pluginManagedResource.findUnique({
    where: {
      workspaceId_resourceType_resourceId: {
        workspaceId: input.workspaceId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      },
    },
    select: { pluginId: true },
  });
  if (existing && existing.pluginId !== input.pluginId)
    badRequest(`resource already managed by plugin '${existing.pluginId}'`);

  return prisma.pluginManagedResource.upsert({
    where: {
      workspaceId_resourceType_resourceId: {
        workspaceId: input.workspaceId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      pluginId: input.pluginId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      externalRef: input.externalRef ?? null,
      metadata: (input.metadata ?? undefined) as never,
    },
    update: {
      externalRef: input.externalRef ?? null,
      metadata: (input.metadata ?? undefined) as never,
    },
  });
}

export function listManagedResources(
  workspaceId: string,
  opts: { pluginId?: string; resourceType?: string } = {},
): Promise<PluginManagedResource[]> {
  return prisma.pluginManagedResource.findMany({
    where: {
      workspaceId,
      ...(opts.pluginId ? { pluginId: opts.pluginId } : {}),
      ...(opts.resourceType ? { resourceType: opts.resourceType } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function unregisterManagedResource(
  workspaceId: string,
  pluginId: string,
  resourceType: string,
  resourceId: string,
): Promise<boolean> {
  const { count } = await prisma.pluginManagedResource.deleteMany({
    where: { workspaceId, pluginId, resourceType, resourceId },
  });
  return count > 0;
}

/** Drop every managed-resource record for a plugin — called on uninstall. Returns rows removed. */
export async function releasePluginResources(
  workspaceId: string,
  pluginId: string,
): Promise<number> {
  const { count } = await prisma.pluginManagedResource.deleteMany({
    where: { workspaceId, pluginId },
  });
  return count;
}
