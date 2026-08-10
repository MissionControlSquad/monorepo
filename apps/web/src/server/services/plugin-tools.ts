import { prisma } from "@/server/prisma";
import type { PluginTool } from "@agentcenter/database";
import { badRequest } from "./service-errors";

// Plugin tool registry + dispatcher (parity #128 / #127). Plugins contribute tools to the gateway; the
// dispatcher resolves a tool name to its owning plugin at call time. One tool name per workspace (first
// registrant owns it). The actual invocation of the plugin's tool handler is infra-gated (worker); this
// is the registry + resolution the dispatcher uses. Workspace-scoped.

/** Register (or update) a tool contributed by a plugin. Rejects a name owned by a different plugin. */
export async function registerPluginTool(input: {
  workspaceId: string;
  pluginId: string;
  toolName: string;
  displayName: string;
  description?: string | null;
  inputSchema?: unknown;
  enabled?: boolean;
}): Promise<PluginTool> {
  const toolName = input.toolName?.trim();
  if (!toolName) badRequest("toolName is required");
  if (!input.displayName?.trim()) badRequest("displayName is required");

  const existing = await prisma.pluginTool.findUnique({
    where: { workspaceId_toolName: { workspaceId: input.workspaceId, toolName } },
    select: { pluginId: true },
  });
  if (existing && existing.pluginId !== input.pluginId)
    badRequest(`tool '${toolName}' already registered by plugin '${existing.pluginId}'`);

  return prisma.pluginTool.upsert({
    where: { workspaceId_toolName: { workspaceId: input.workspaceId, toolName } },
    create: {
      workspaceId: input.workspaceId,
      pluginId: input.pluginId,
      toolName,
      displayName: input.displayName.trim(),
      description: input.description ?? null,
      inputSchema: (input.inputSchema ?? undefined) as never,
      enabled: input.enabled ?? true,
    },
    update: {
      displayName: input.displayName.trim(),
      description: input.description ?? null,
      inputSchema: (input.inputSchema ?? undefined) as never,
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
    },
  });
}

export function listPluginTools(
  workspaceId: string,
  opts: { pluginId?: string; enabledOnly?: boolean } = {},
): Promise<PluginTool[]> {
  return prisma.pluginTool.findMany({
    where: {
      workspaceId,
      ...(opts.pluginId ? { pluginId: opts.pluginId } : {}),
      ...(opts.enabledOnly ? { enabled: true } : {}),
    },
    orderBy: { toolName: "asc" },
  });
}

/**
 * Dispatcher resolution (#127): map a tool name to the enabled tool that will handle it, or null if no
 * such tool is registered/enabled. The caller then checks the owning plugin is effective before use.
 */
export function resolvePluginTool(
  workspaceId: string,
  toolName: string,
): Promise<PluginTool | null> {
  return prisma.pluginTool.findFirst({
    where: { workspaceId, toolName, enabled: true },
  });
}

export async function setPluginToolEnabled(
  workspaceId: string,
  toolName: string,
  enabled: boolean,
): Promise<PluginTool> {
  const { count } = await prisma.pluginTool.updateMany({
    where: { workspaceId, toolName },
    data: { enabled },
  });
  if (count === 0) badRequest("Tool not found");
  return (await prisma.pluginTool.findFirst({ where: { workspaceId, toolName } }))!;
}

/** Drop every tool a plugin registered — called on uninstall. Returns rows removed. */
export async function unregisterPluginTools(
  workspaceId: string,
  pluginId: string,
): Promise<number> {
  const { count } = await prisma.pluginTool.deleteMany({ where: { workspaceId, pluginId } });
  return count;
}
