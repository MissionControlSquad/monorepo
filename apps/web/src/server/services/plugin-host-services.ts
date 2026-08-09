import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import type { PluginHostService } from "@agentcenter/database";
import { isPluginEffective, type PluginLifecycleState } from "@agentcenter/utils";

// Plugin host services + environment drivers (parity #110 / #107). The registry + status surface for
// long-running services and environment drivers a plugin provides. The worker-manager (infra-gated)
// transitions status as it actually starts/stops the process; this layer records + resolves. Uninstall
// cleanup is handled centrally in plugins.uninstallPlugin. Workspace-scoped.

const KINDS = new Set(["service", "environment_driver", "webhook"]);
const STATUSES = new Set(["declared", "starting", "running", "stopped", "error"]);

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export async function registerHostService(input: {
  workspaceId: string;
  pluginId: string;
  serviceKey: string;
  kind: string;
  endpoint?: string | null;
  config?: unknown;
}): Promise<PluginHostService> {
  if (!input.serviceKey?.trim()) badRequest("serviceKey is required");
  if (!KINDS.has(input.kind)) badRequest("kind must be service, environment_driver, or webhook");
  return prisma.pluginHostService.upsert({
    where: {
      workspaceId_pluginId_serviceKey: {
        workspaceId: input.workspaceId,
        pluginId: input.pluginId,
        serviceKey: input.serviceKey,
      },
    },
    create: {
      workspaceId: input.workspaceId,
      pluginId: input.pluginId,
      serviceKey: input.serviceKey,
      kind: input.kind,
      endpoint: input.endpoint ?? null,
      config: (input.config ?? undefined) as never,
    },
    update: {
      kind: input.kind,
      endpoint: input.endpoint ?? null,
      config: (input.config ?? undefined) as never,
    },
  });
}

/** Transition a host service's status (the worker-manager reports lifecycle here). */
export async function setHostServiceStatus(
  workspaceId: string,
  id: string,
  status: string,
  opts: { endpoint?: string | null; lastError?: string | null } = {},
): Promise<PluginHostService> {
  if (!STATUSES.has(status)) badRequest("invalid host-service status");
  const { count } = await prisma.pluginHostService.updateMany({
    where: { id, workspaceId },
    data: {
      status,
      ...(opts.endpoint !== undefined ? { endpoint: opts.endpoint } : {}),
      lastError: status === "error" ? (opts.lastError ?? "unknown error") : null,
    },
  });
  if (count === 0) badRequest("Host service not found");
  return (await prisma.pluginHostService.findFirst({ where: { id, workspaceId } }))!;
}

export function listHostServices(
  workspaceId: string,
  opts: { pluginId?: string; kind?: string } = {},
): Promise<PluginHostService[]> {
  return prisma.pluginHostService.findMany({
    where: {
      workspaceId,
      ...(opts.pluginId ? { pluginId: opts.pluginId } : {}),
      ...(opts.kind ? { kind: opts.kind } : {}),
    },
    orderBy: { serviceKey: "asc" },
  });
}

/**
 * Resolve an environment driver (#107) provided by a plugin: the running environment_driver with the
 * given key, but only when its plugin is effective. Returns null otherwise so the environments system
 * falls back to a built-in transport.
 */
export async function resolvePluginEnvironmentDriver(
  workspaceId: string,
  driverKey: string,
): Promise<PluginHostService | null> {
  const driver = await prisma.pluginHostService.findFirst({
    where: { workspaceId, kind: "environment_driver", serviceKey: driverKey, status: "running" },
  });
  if (!driver) return null;
  const plugin = await prisma.plugin.findUnique({
    where: { workspaceId_pluginId: { workspaceId, pluginId: driver.pluginId } },
    select: { status: true, enabled: true },
  });
  const state: PluginLifecycleState = {
    status: (plugin?.status as PluginLifecycleState["status"]) ?? "error",
    enabled: plugin?.enabled ?? false,
    removed: !plugin,
  };
  return isPluginEffective(state) ? driver : null;
}
