import { prisma } from "@/server/prisma";
import type { AdapterPlugin } from "@agentcenter/database";
import {
  adapterFromPluginSpec,
  loadAdapterPlugins,
  type AdapterPluginSpec,
} from "@agentcenter/utils";
import { badRequest } from "./service-errors";

// Adapter-plugin store (parity #5). Persist declarative runtime adapters (base + baked template) and
// load the enabled ones into the in-process adapter registry. Validation reuses adapterFromPluginSpec
// so a malformed spec is rejected at write time, never at run time. Workspace-scoped; ADAPTER-plugin
// edits are admin-gated at the resolver.

const BASES = new Set(["process", "shell", "http"]);

function toSpec(row: {
  key: string;
  displayName: string | null;
  base: string;
  template: unknown;
  models: string[];
  supportsModel: boolean;
}): AdapterPluginSpec {
  return {
    key: row.key,
    displayName: row.displayName ?? undefined,
    base: row.base as AdapterPluginSpec["base"],
    template: row.template as string | string[],
    models: row.models,
    supportsModel: row.supportsModel,
  };
}

/** Create or update an adapter plugin. Validates the spec builds before persisting. */
export async function upsertAdapterPlugin(input: {
  workspaceId: string;
  key: string;
  displayName?: string | null;
  base: string;
  template: string | string[];
  models?: string[];
  supportsModel?: boolean;
  enabled?: boolean;
  createdByProfileId?: string | null;
}): Promise<AdapterPlugin> {
  const key = input.key?.trim();
  if (!key) badRequest("adapter key is required");
  if (!BASES.has(input.base)) badRequest("base must be process, shell, or http");
  // Validate by constructing the adapter (throws on empty template / bad base).
  try {
    adapterFromPluginSpec({
      key,
      base: input.base as AdapterPluginSpec["base"],
      template: input.template,
      models: input.models,
      supportsModel: input.supportsModel,
    });
  } catch (err) {
    badRequest((err as Error).message);
  }

  const data = {
    displayName: input.displayName ?? null,
    base: input.base,
    template: input.template as never,
    models: input.models ?? [],
    supportsModel: input.supportsModel ?? false,
    enabled: input.enabled ?? true,
  };
  return prisma.adapterPlugin.upsert({
    where: { workspaceId_key: { workspaceId: input.workspaceId, key } },
    create: {
      workspaceId: input.workspaceId,
      key,
      createdByProfileId: input.createdByProfileId ?? null,
      ...data,
    },
    update: data,
  });
}

export function listAdapterPlugins(workspaceId: string): Promise<AdapterPlugin[]> {
  return prisma.adapterPlugin.findMany({ where: { workspaceId }, orderBy: { key: "asc" } });
}

export async function deleteAdapterPlugin(workspaceId: string, key: string): Promise<boolean> {
  const { count } = await prisma.adapterPlugin.deleteMany({ where: { workspaceId, key } });
  return count > 0;
}

/**
 * Load a workspace's enabled adapter plugins into the in-process registry. Called at startup and after
 * an edit. Returns the keys registered. A single bad row is skipped (logged) rather than failing the
 * whole load.
 */
export async function loadWorkspaceAdapterPlugins(workspaceId: string): Promise<string[]> {
  const rows = await prisma.adapterPlugin.findMany({ where: { workspaceId, enabled: true } });
  const specs: AdapterPluginSpec[] = [];
  for (const row of rows) {
    try {
      specs.push(toSpec(row));
    } catch (err) {
      console.error(`[adapter-plugins] skipping invalid plugin '${row.key}'`, err);
    }
  }
  return loadAdapterPlugins(specs);
}
