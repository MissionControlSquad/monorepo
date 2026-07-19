/**
 * Plugin SDK — manifest validation + registry (Epic #6). v1 is the install-time contract only: a
 * registered plugin is inert metadata (no runtime). Ports Paperclip `plugin-manifest-validator.ts` +
 * `validators/plugin.ts` (core subset). Declared capabilities are recorded, not granted (spec D2).
 */
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import { validateManifest } from "@agentcenter/utils";
import type { PluginCategory } from "@agentcenter/utils";
import type { Plugin, Prisma } from "@agentcenter/database";

// Manifest validation (validateManifest + isValidCron + the manifest schema) is shared in
// @agentcenter/utils. This file is the registry DB layer. Re-exported for existing importers.
export {
  validateManifest,
  isValidCron,
  type PluginManifest,
  type ValidateResult,
} from "@agentcenter/utils";

function badRequest(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

export function listPlugins(workspaceId: string): Promise<Plugin[]> {
  return prisma.plugin.findMany({ where: { workspaceId }, orderBy: { displayName: "asc" } });
}

/**
 * Install (or upgrade) a plugin from its manifest. Keyed by (workspaceId, manifest.id): a new id
 * installs; an existing id upgrades in place (version/manifest/capabilities replaced, status reset to
 * `installed`, `enabled` preserved).
 */
export async function installPlugin(
  workspaceId: string,
  input: unknown,
  installedByProfileId?: string | null,
): Promise<Plugin> {
  const res = validateManifest(input);
  if (!res.ok) badRequest(`Invalid plugin manifest — ${res.errors.join("; ")}`);
  const m = res.manifest;
  return prisma.plugin.upsert({
    where: { workspaceId_pluginId: { workspaceId, pluginId: m.id } },
    create: {
      workspaceId,
      pluginId: m.id,
      name: m.id,
      version: m.version,
      displayName: m.displayName,
      description: m.description ?? null,
      category: m.category as PluginCategory,
      capabilities: m.capabilities,
      manifest: m as unknown as Prisma.InputJsonValue,
      status: "installed",
      installedByProfileId: installedByProfileId ?? null,
    },
    update: {
      version: m.version,
      displayName: m.displayName,
      description: m.description ?? null,
      category: m.category as PluginCategory,
      capabilities: m.capabilities,
      manifest: m as unknown as Prisma.InputJsonValue,
      status: "installed",
    },
  });
}

export async function setPluginEnabled(
  workspaceId: string,
  pluginId: string,
  enabled: boolean,
): Promise<Plugin> {
  const existing = await prisma.plugin.findUnique({
    where: { workspaceId_pluginId: { workspaceId, pluginId } },
    select: { id: true },
  });
  if (!existing) badRequest("Plugin not found");
  return prisma.plugin.update({
    where: { id: existing.id },
    data: { enabled, status: enabled ? "installed" : "disabled" },
  });
}

export async function uninstallPlugin(workspaceId: string, pluginId: string): Promise<boolean> {
  const existing = await prisma.plugin.findUnique({
    where: { workspaceId_pluginId: { workspaceId, pluginId } },
    select: { id: true },
  });
  if (!existing) badRequest("Plugin not found");
  await prisma.plugin.delete({ where: { id: existing.id } });
  return true;
}
