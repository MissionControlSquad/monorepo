import { prisma } from "@/server/prisma";
import { resolveWorkspaceSecret } from "@/server/services/secrets";
import {
  resolveSecretRefs,
  maskSecretRefs,
  collectSecretRefs,
  isPluginEffective,
  type PluginLifecycleState,
} from "@agentcenter/utils";
import { GraphQLError } from "graphql";

// Plugin secrets handler (parity #124). A plugin's per-workspace config may embed secret references
// ({ secretRef: { name } }). At run time the host must resolve those into real values from the
// workspace vault before handing config to the plugin — but only for an effective plugin, and never
// exposing raw values to any read/display path (use maskPluginConfig for that). Workspace-scoped.

function notFound(message: string): never {
  throw new GraphQLError(message, { extensions: { code: "NOT_FOUND" } });
}

async function loadEffectivePlugin(
  workspaceId: string,
  pluginId: string,
): Promise<{ config: unknown }> {
  const plugin = await prisma.plugin.findUnique({
    where: { workspaceId_pluginId: { workspaceId, pluginId } },
    select: { config: true, status: true, enabled: true },
  });
  if (!plugin) notFound("Plugin not found");
  const state: PluginLifecycleState = {
    status: plugin.status as PluginLifecycleState["status"],
    enabled: plugin.enabled,
  };
  if (!isPluginEffective(state))
    throw new GraphQLError("plugin is not active", { extensions: { code: "FORBIDDEN" } });
  return { config: plugin.config };
}

/**
 * Resolve every secret ref in a plugin's config into real vault values, ready to hand to the plugin at
 * run time. Throws if the plugin isn't effective or a referenced secret is missing. NEVER cache or log
 * the result — it contains plaintext secrets.
 */
export async function resolvePluginSecrets(
  workspaceId: string,
  pluginId: string,
): Promise<unknown> {
  const { config } = await loadEffectivePlugin(workspaceId, pluginId);
  if (config == null) return config;
  return resolveSecretRefs(config, (name) => resolveWorkspaceSecret(workspaceId, name));
}

/** The set of secret names a plugin's config depends on — for a pre-run "missing secret" check. */
export async function pluginSecretDependencies(
  workspaceId: string,
  pluginId: string,
): Promise<string[]> {
  const plugin = await prisma.plugin.findUnique({
    where: { workspaceId_pluginId: { workspaceId, pluginId } },
    select: { config: true },
  });
  if (!plugin) notFound("Plugin not found");
  return [...collectSecretRefs(plugin.config)].sort();
}

/** Display-safe view of a plugin's config: every secret ref becomes `secret:<name>`, no plaintext. */
export async function maskPluginConfig(workspaceId: string, pluginId: string): Promise<unknown> {
  const plugin = await prisma.plugin.findUnique({
    where: { workspaceId_pluginId: { workspaceId, pluginId } },
    select: { config: true },
  });
  if (!plugin) notFound("Plugin not found");
  return maskSecretRefs(plugin.config);
}
