import { prisma } from "@/server/prisma";
import type { PluginKv } from "@agentcenter/database";

// Plugin state store + database (parity #125 / #105). A namespaced per-plugin key/value store. The
// "state" namespace backs plugin.state.read/write; other namespaces (`db:<collection>`) give a plugin a
// simple document store. Values are arbitrary JSON. Workspace + plugin scoped. Gated by the
// plugin.state.* capability at the call site (the runtime), not here.

const DEFAULT_NS = "state";

/** Read one value (null when unset). */
export async function getPluginState(
  workspaceId: string,
  pluginId: string,
  key: string,
  namespace = DEFAULT_NS,
): Promise<unknown | null> {
  const row = await prisma.pluginKv.findUnique({
    where: { workspaceId_pluginId_namespace_key: { workspaceId, pluginId, namespace, key } },
    select: { value: true },
  });
  return row ? row.value : null;
}

/** Upsert one value. */
export async function setPluginState(
  workspaceId: string,
  pluginId: string,
  key: string,
  value: unknown,
  namespace = DEFAULT_NS,
): Promise<PluginKv> {
  return prisma.pluginKv.upsert({
    where: { workspaceId_pluginId_namespace_key: { workspaceId, pluginId, namespace, key } },
    create: { workspaceId, pluginId, namespace, key, value: value as never },
    update: { value: value as never },
  });
}

/** Delete one key. Returns true if a row was removed. */
export async function deletePluginState(
  workspaceId: string,
  pluginId: string,
  key: string,
  namespace = DEFAULT_NS,
): Promise<boolean> {
  const { count } = await prisma.pluginKv.deleteMany({
    where: { workspaceId, pluginId, namespace, key },
  });
  return count > 0;
}

/** List all key/value entries in a namespace for a plugin. */
export async function listPluginState(
  workspaceId: string,
  pluginId: string,
  namespace = DEFAULT_NS,
): Promise<{ key: string; value: unknown }[]> {
  const rows = await prisma.pluginKv.findMany({
    where: { workspaceId, pluginId, namespace },
    orderBy: { key: "asc" },
    select: { key: true, value: true },
  });
  return rows.map((r) => ({ key: r.key, value: r.value }));
}

/** Drop every KV entry for a plugin (all namespaces) — called on uninstall. Returns rows removed. */
export async function clearPluginState(workspaceId: string, pluginId: string): Promise<number> {
  const { count } = await prisma.pluginKv.deleteMany({ where: { workspaceId, pluginId } });
  return count;
}
