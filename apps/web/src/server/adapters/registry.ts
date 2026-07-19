/**
 * Agent adapter registry (Epic #2). Resolves adapters from the global `AgentAdapter` table and
 * validates per-agent `adapterConfig` against an adapter's JSON-Schema (draft-07).
 *
 * The builtIn `openclaw-gateway` adapter is ALWAYS resolvable regardless of the
 * `multi_provider_adapters` feature — existing OpenClaw agents keep working when the feature is
 * off. Other adapters only surface when the feature is enabled.
 */
import Ajv, { type ValidateFunction } from "ajv";
import { prisma } from "@/server/prisma";
import type { AgentAdapter } from "@agentcenter/database";

export const BUILTIN_ADAPTER_TYPE = "openclaw-gateway";

// strict:false — seeded schemas are plain draft-07; allErrors for full feedback.
const ajv = new Ajv({ allErrors: true, strict: false });
const validatorCache = new Map<string, ValidateFunction>();

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a config object against an adapter's JSON Schema. Unknown keys are rejected
 * (additionalProperties is forced false at the top level) so a typo or a stray secret can't slip
 * through. Pure — no I/O.
 */
export function validateAdapterConfig(
  configSchema: unknown,
  config: unknown,
): ConfigValidationResult {
  const schema =
    configSchema && typeof configSchema === "object"
      ? { additionalProperties: false, ...(configSchema as Record<string, unknown>) }
      : { type: "object", additionalProperties: false };
  const key = JSON.stringify(schema);
  let validate = validatorCache.get(key);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(key, validate);
  }
  const valid = validate(config ?? {}) as boolean;
  if (valid) return { valid: true, errors: [] };
  const errors = (validate.errors ?? []).map((e) =>
    `${e.instancePath || "(root)"} ${e.message ?? "is invalid"}`.trim(),
  );
  return { valid: false, errors };
}

/** Resolve one adapter by type. openclaw-gateway is always resolvable (builtIn). */
export function getAdapter(type: string): Promise<AgentAdapter | null> {
  return prisma.agentAdapter.findUnique({ where: { type } });
}

/**
 * List selectable adapters. When the multi-provider feature is OFF, only builtIn adapters
 * (openclaw-gateway) are returned so no other provider is selectable.
 */
export async function listAdapters(opts: {
  featureEnabled: boolean;
  enabledOnly?: boolean;
}): Promise<AgentAdapter[]> {
  return prisma.agentAdapter.findMany({
    where: {
      ...(opts.enabledOnly ? { enabled: true } : {}),
      ...(opts.featureEnabled ? {} : { builtIn: true }),
    },
    orderBy: [{ builtIn: "desc" }, { displayName: "asc" }],
  });
}

/** Whether an adapter type is selectable given the feature state (builtIn always is). */
export async function isAdapterSelectable(type: string, featureEnabled: boolean): Promise<boolean> {
  const adapter = await getAdapter(type);
  if (!adapter || !adapter.enabled) return false;
  return adapter.builtIn || featureEnabled;
}
