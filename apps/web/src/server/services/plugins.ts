/**
 * Plugin SDK — manifest validation + registry (Epic #6). v1 is the install-time contract only: a
 * registered plugin is inert metadata (no runtime). Ports Paperclip `plugin-manifest-validator.ts` +
 * `validators/plugin.ts` (core subset). Declared capabilities are recorded, not granted (spec D2).
 */
import { z } from "zod";
import { GraphQLError } from "graphql";
import { prisma } from "@/server/prisma";
import {
  PLUGIN_API_VERSION,
  PLUGIN_CATEGORIES,
  isPluginCapability,
  type PluginCategory,
} from "@agentcenter/utils";
import type { Plugin, Prisma } from "@agentcenter/database";

/**
 * Validate a 5-field cron expression (each field: a star, N, N-M, step, or comma list).
 * Ported verbatim from Paperclip `validators/plugin.ts`.
 */
const CRON_FIELD =
  /^(\*(?:\/[0-9]+)?|[0-9]+(?:-[0-9]+)?(?:\/[0-9]+)?)(?:,(\*(?:\/[0-9]+)?|[0-9]+(?:-[0-9]+)?(?:\/[0-9]+)?))*$/;
export function isValidCron(expression: string): boolean {
  const trimmed = expression.trim();
  if (!trimmed) return false;
  const fields = trimmed.split(/\s+/);
  return fields.length === 5 && fields.every((f) => CRON_FIELD.test(f));
}

const toolSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().min(1),
});
const jobSchema = z.object({
  jobKey: z.string().min(1),
  displayName: z.string().min(1),
  schedule: z
    .string()
    .refine(isValidCron, { message: "schedule must be a valid 5-field cron expression" })
    .optional(),
});

// The v1 manifest core. Unknown top-level keys are ignored (forward-compat, spec D3).
const manifestSchema = z.object({
  apiVersion: z.literal(PLUGIN_API_VERSION),
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "id must be a lowercase slug (letters, digits, hyphens)"),
  version: z.string().min(1),
  displayName: z.string().min(1),
  description: z.string().optional(),
  category: z.enum(PLUGIN_CATEGORIES),
  capabilities: z
    .array(z.string())
    .default([])
    .refine((caps) => caps.every(isPluginCapability), {
      message: "manifest declares an unknown capability",
    }),
  tools: z.array(toolSchema).optional(),
  jobs: z.array(jobSchema).optional(),
});

export type PluginManifest = z.infer<typeof manifestSchema>;
export type ValidateResult =
  { ok: true; manifest: PluginManifest } | { ok: false; errors: string[] };

/** Pure: validate a manifest payload. Never throws. */
export function validateManifest(input: unknown): ValidateResult {
  const parsed = manifestSchema.safeParse(input);
  if (parsed.success) return { ok: true, manifest: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

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
