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
import { getAdapter as getCodeAdapter } from "@agentcenter/utils";

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

// ── Built-in adapter seeding (parity #6 — drive DB rows from the Tier-D code registry) ──

type AdapterTransport = "local" | "gateway" | "cloud";
type AdapterAuthKind = "none" | "apiKey" | "subscription" | "secretBinding";

// Code key → DB row shape. openclaw is the protected gateway builtIn; the rest are the `*-local`
// providers (hermes seeds bare, matching the original migration). process/shell/http are internal
// mechanisms, not user-selectable providers, so they are intentionally not seeded.
const BUILTIN_ADAPTER_DB: Record<
  string,
  {
    type: string;
    transport: AdapterTransport;
    authKind: AdapterAuthKind;
    builtIn: boolean;
    /** Override the derived config schema (gateway adapters carry base URL + auth secret-ref). */
    configSchema?: unknown;
  }
> = {
  openclaw: { type: "openclaw-gateway", transport: "gateway", authKind: "apiKey", builtIn: true },
  claude: { type: "claude-local", transport: "local", authKind: "subscription", builtIn: false },
  codex: { type: "codex-local", transport: "local", authKind: "subscription", builtIn: false },
  gemini: { type: "gemini-local", transport: "local", authKind: "subscription", builtIn: false },
  cursor: { type: "cursor-local", transport: "local", authKind: "apiKey", builtIn: false },
  grok: { type: "grok-local", transport: "local", authKind: "apiKey", builtIn: false },
  opencode: { type: "opencode-local", transport: "local", authKind: "apiKey", builtIn: false },
  pi: { type: "pi-local", transport: "local", authKind: "apiKey", builtIn: false },
  hermes: { type: "hermes", transport: "local", authKind: "apiKey", builtIn: false },
  // Hermes HTTP + SSE gateway (reaches an already-running Hermes API server). transport "gateway",
  // authKind "secretBinding": the API key is stored ONLY as a vault secret-ref (apiKeySecretRef),
  // never inline — additionalProperties:false rejects a stray `apiKey`. Gated behind
  // multi_provider_adapters like every non-builtIn provider (builtIn:false).
  "hermes-gateway": {
    type: "hermes-gateway",
    transport: "gateway",
    authKind: "secretBinding",
    builtIn: false,
    configSchema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["apiBaseUrl", "apiKeySecretRef"],
      properties: {
        apiBaseUrl: { type: "string", format: "uri" },
        apiKeySecretRef: { type: "string" },
        sessionKeyStrategy: { type: "string", enum: ["issue", "agent", "run", "none"] },
        instructions: { type: "string" },
        headers: { type: "object" },
        timeoutSec: { type: "number" },
        eventReconnectMs: { type: "number" },
        dangerouslyAllowInsecureRemoteHttp: { type: "boolean" },
        model: { type: "string" },
      },
    },
  },
};

// Derive a draft-07 config schema from what the code adapter accepts.
function configSchemaFor(adapter: { supportsModel: boolean; requiresTemplate: boolean }): unknown {
  const properties: Record<string, unknown> = {};
  if (adapter.supportsModel) properties.model = { type: "string" };
  if (adapter.requiresTemplate) properties.template = { type: "string" };
  return { $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties };
}

/**
 * Idempotently ensure every built-in code adapter has a corresponding AgentAdapter DB row, so a new
 * provider added to the Tier-D registry auto-seeds (no manual migration) and the two registries stay
 * consistent. Create-if-absent: an existing row (incl. admin edits to enabled/displayName) is never
 * overwritten. Returns the types it created. (Parity #6.)
 */
export async function ensureBuiltinAdapters(): Promise<string[]> {
  const created: string[] = [];
  for (const [key, meta] of Object.entries(BUILTIN_ADAPTER_DB)) {
    const code = getCodeAdapter(key);
    if (!code) continue;
    const existing = await prisma.agentAdapter.findUnique({
      where: { type: meta.type },
      select: { type: true },
    });
    if (existing) continue;
    await prisma.agentAdapter.create({
      data: {
        type: meta.type,
        displayName: code.displayName,
        transport: meta.transport,
        authKind: meta.authKind,
        configSchema: (meta.configSchema ?? configSchemaFor(code)) as never,
        builtIn: meta.builtIn,
        enabled: true,
      },
    });
    created.push(meta.type);
  }
  return created;
}
