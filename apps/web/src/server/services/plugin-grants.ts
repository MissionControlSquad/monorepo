import { prisma } from "@/server/prisma";
import type { Plugin, PluginGrant } from "@agentcenter/database";
import {
  isPluginCapability,
  resolveGrantedCapabilities,
  requirePluginCapability,
  type PluginCapability,
} from "@agentcenter/utils";
import { badRequest } from "./service-errors";

// Plugin runtime capability enforcement (parity #103 — the security half of the execution runtime).
// The registry records a manifest's DECLARED capabilities; nothing runs on that alone. A capability is
// only usable once an admin GRANTS it here, and the dispatcher/host-call path consults the granted set
// before letting a plugin act. Fail-closed: no grant → the capability-gated action throws. This module
// is the single source of truth for "may plugin P use capability C?". Workspace-scoped (D5).

/** Thrown when a plugin invokes a capability-gated action it was never granted (fail-closed refusal). */
export class PluginCapabilityDeniedError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly capability: string,
  ) {
    super(`plugin '${pluginId}' is not granted the '${capability}' capability`);
    this.name = "PluginCapabilityDeniedError";
  }
}

async function requirePlugin(workspaceId: string, pluginId: string): Promise<Plugin> {
  const p = await prisma.plugin.findUnique({
    where: { workspaceId_pluginId: { workspaceId, pluginId } },
  });
  if (!p) badRequest("Plugin not found");
  return p;
}

/**
 * Grant a capability to a plugin (admin action). Least-privilege: the capability MUST be one the
 * plugin's manifest declared — you cannot grant beyond what the plugin asked for. Idempotent on
 * (workspace, plugin, capability). Rejects unknown capabilities and undeclared ones (fail-closed).
 */
export async function grantPluginCapability(input: {
  workspaceId: string;
  pluginId: string;
  capability: string;
  grantedByProfileId?: string | null;
}): Promise<PluginGrant> {
  const { workspaceId, pluginId, capability } = input;
  if (!isPluginCapability(capability)) badRequest(`unknown capability '${capability}'`);
  const plugin = await requirePlugin(workspaceId, pluginId);
  if (!plugin.capabilities.includes(capability))
    badRequest(`plugin '${pluginId}' did not declare the '${capability}' capability`);
  return prisma.pluginGrant.upsert({
    where: { workspaceId_pluginId_capability: { workspaceId, pluginId, capability } },
    create: {
      workspaceId,
      pluginId,
      capability,
      grantedByProfileId: input.grantedByProfileId ?? null,
    },
    update: { grantedByProfileId: input.grantedByProfileId ?? null },
  });
}

/** Revoke a capability from a plugin (admin action). Returns true if a grant was removed. */
export async function revokePluginCapability(
  workspaceId: string,
  pluginId: string,
  capability: string,
): Promise<boolean> {
  const { count } = await prisma.pluginGrant.deleteMany({
    where: { workspaceId, pluginId, capability },
  });
  return count > 0;
}

/** List the capabilities currently granted to a plugin. */
export function listPluginGrants(workspaceId: string, pluginId: string): Promise<PluginGrant[]> {
  return prisma.pluginGrant.findMany({
    where: { workspaceId, pluginId },
    orderBy: { capability: "asc" },
  });
}

/**
 * The set of capabilities a plugin is EFFECTIVELY granted right now: the intersection of what it
 * declared and what an admin granted, filtered to real capabilities (least privilege). The runtime
 * calls this before dispatching. A grant for a capability the manifest no longer declares (e.g. after a
 * downgrade) is dropped here, so a stale grant can never over-authorize.
 */
export async function resolveGrantedForPlugin(
  workspaceId: string,
  pluginId: string,
): Promise<PluginCapability[]> {
  const [plugin, grants] = await Promise.all([
    prisma.plugin.findUnique({
      where: { workspaceId_pluginId: { workspaceId, pluginId } },
      select: { capabilities: true },
    }),
    prisma.pluginGrant.findMany({ where: { workspaceId, pluginId }, select: { capability: true } }),
  ]);
  if (!plugin) return [];
  const { granted } = resolveGrantedCapabilities(
    plugin.capabilities,
    grants.map((g) => g.capability),
  );
  return granted;
}

/**
 * FAIL-CLOSED enforcement point. Throws PluginCapabilityDeniedError unless the plugin holds a live grant
 * for `capability` (intersected with its manifest declaration). This is the guard the tool dispatcher,
 * job runner, and host-service call path all funnel through — one place, so a capability can never be
 * exercised without an explicit grant.
 */
export async function assertPluginCapability(
  workspaceId: string,
  pluginId: string,
  capability: PluginCapability,
): Promise<void> {
  const granted = await resolveGrantedForPlugin(workspaceId, pluginId);
  try {
    requirePluginCapability(granted, capability);
  } catch {
    // Normalize the pure guard's error into the runtime's typed, plugin-aware refusal.
    throw new PluginCapabilityDeniedError(pluginId, capability);
  }
}
