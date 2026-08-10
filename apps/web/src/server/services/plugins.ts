/**
 * Plugin SDK — manifest validation + registry (Epic #6). v1 is the install-time contract only: a
 * registered plugin is inert metadata (no runtime). Ports Paperclip `plugin-manifest-validator.ts` +
 * `validators/plugin.ts` (core subset). Declared capabilities are recorded, not granted (spec D2).
 */
import { prisma } from "@/server/prisma";
import { validateManifest } from "@agentcenter/utils";
import type { PluginCategory } from "@agentcenter/utils";
import type { Plugin, Prisma } from "@agentcenter/database";
// A generic JSON-Schema (draft-07) validator — named for adapters but schema-agnostic; reused here so
// plugin config validation matches the adapter config path exactly (no second validator).
import { validateAdapterConfig as validateAgainstSchema } from "@/server/adapters/registry";
import { badRequest } from "./service-errors";

// Manifest validation (validateManifest + isValidCron + the manifest schema) is shared in
// @agentcenter/utils. This file is the registry DB layer. Re-exported for existing importers.
export {
  validateManifest,
  isValidCron,
  type PluginManifest,
  type ValidateResult,
} from "@agentcenter/utils";

export function listPlugins(workspaceId: string): Promise<Plugin[]> {
  return prisma.plugin.findMany({ where: { workspaceId }, orderBy: { displayName: "asc" } });
}

/** Single plugin (for the detail page). Null if it isn't installed in this workspace. */
export function getPlugin(workspaceId: string, pluginId: string): Promise<Plugin | null> {
  return prisma.plugin.findUnique({ where: { workspaceId_pluginId: { workspaceId, pluginId } } });
}

async function requirePlugin(workspaceId: string, pluginId: string): Promise<Plugin> {
  const p = await prisma.plugin.findUnique({
    where: { workspaceId_pluginId: { workspaceId, pluginId } },
  });
  if (!p) badRequest("Plugin not found");
  return p;
}

/** The configSchema a plugin declared in its manifest, or null if it has no configurable settings. */
function manifestConfigSchema(manifest: Prisma.JsonValue): Record<string, unknown> | null {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) return null;
  const cs = (manifest as Record<string, unknown>).configSchema;
  return cs && typeof cs === "object" && !Array.isArray(cs)
    ? (cs as Record<string, unknown>)
    : null;
}

/** Save per-workspace config, validated against the plugin's declared configSchema. */
export async function setPluginConfig(
  workspaceId: string,
  pluginId: string,
  config: Record<string, unknown>,
): Promise<Plugin> {
  const plugin = await requirePlugin(workspaceId, pluginId);
  const schema = manifestConfigSchema(plugin.manifest);
  if (!schema) badRequest("This plugin has no configurable settings");

  const result = validateAgainstSchema(schema, config ?? {});
  if (!result.valid) badRequest(`config invalid: ${result.errors.join("; ")}`);

  return prisma.plugin.update({
    where: { id: plugin.id },
    data: { config: (config ?? {}) as Prisma.InputJsonValue },
  });
}

/** Operator clears a plugin's error state (a manual "retry") → back to installed, lastError null. */
export async function clearPluginError(workspaceId: string, pluginId: string): Promise<Plugin> {
  const plugin = await requirePlugin(workspaceId, pluginId);
  return prisma.plugin.update({
    where: { id: plugin.id },
    data: { status: plugin.enabled ? "installed" : "disabled", lastError: null },
  });
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
  // Clean up everything the plugin owned (#109): managed resources, contributed tools, KV state, and
  // any queued jobs. Best-effort and idempotent — these tables are empty unless the runtime populated
  // them, so this is a no-op for registry-only plugins.
  await Promise.all([
    prisma.pluginManagedResource.deleteMany({ where: { workspaceId, pluginId } }),
    prisma.pluginTool.deleteMany({ where: { workspaceId, pluginId } }),
    prisma.pluginKv.deleteMany({ where: { workspaceId, pluginId } }),
    prisma.pluginJob.deleteMany({ where: { workspaceId, pluginId } }),
    prisma.pluginHostService.deleteMany({ where: { workspaceId, pluginId } }),
  ]);
  await prisma.plugin.delete({ where: { id: existing.id } });
  return true;
}
