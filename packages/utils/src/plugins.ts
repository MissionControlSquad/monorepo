/**
 * Plugin manifest validation (Epic #6) — shared across all apps. Import from @agentcenter/utils. Pure
 * (zod) — the web service does the registry DB writes.
 */
import { z } from "zod";
import { PLUGIN_API_VERSION, PLUGIN_CATEGORIES, isPluginCapability } from "./plugin-constants";
// Cron validation now lives in ./cron (a full field-range-aware parser, superseding the old regex).
import { isValidCron } from "./cron";

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

// ── Extensibility residuals (§3 plugins) — all additive/optional so existing manifests stay valid ──

// A UI extension slot: the plugin declares a named `slot` it wants to render into and an `entry` the
// host loads inside a sandboxed iframe. `entry` is a same-origin path (rendered with an opaque origin;
// see PluginSlot) or an https URL. No inline HTML/JS is accepted here — the host never eval()s plugin
// markup; it only points an iframe `src` at the entry.
const uiSlotSchema = z.object({
  slot: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9.\-:]*$/, "slot must be a lowercase dotted/hyphen key"),
  entry: z
    .string()
    .min(1)
    .regex(
      /^(\/[\w\-./]*|https:\/\/[\w.\-/:?=&%#]+)$/,
      "entry must be a same-origin path or https URL",
    ),
  title: z.string().optional(),
  description: z.string().optional(),
});

// A scoped API route the plugin exposes. The host mounts it under /api/plugins/<id>/x/<path> and
// dispatches into the plugin worker, capability-checked. `capability` (when set) MUST be one the
// manifest also declares and an admin granted — the host is fail-closed.
const apiRouteSchema = z.object({
  path: z
    .string()
    .min(1)
    .regex(/^\/[\w\-./]*$/, "path must start with / and contain only word chars, - . /"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
  handler: z.string().min(1).optional(), // route key in the plugin module's `routes` map (defaults to method+path)
  capability: z
    .string()
    .refine(isPluginCapability, { message: "route declares an unknown capability" })
    .optional(),
  description: z.string().optional(),
});

// An inbound webhook the plugin receives. The host mounts /api/plugins/<id>/webhooks/<hook>, verifies an
// HMAC signature against a per-plugin signing secret (workspace vault, `secretName` or the default
// `plugin.<id>.webhook.<hook>`), and enqueues `jobKey` (default `webhook:<hook>`). Requires the
// `webhooks.receive` capability, granted.
const webhookSchema = z.object({
  hook: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "hook must be a lowercase slug"),
  secretName: z.string().min(1).optional(),
  jobKey: z.string().min(1).optional(),
  description: z.string().optional(),
});

export type PluginUiSlot = z.infer<typeof uiSlotSchema>;
export type PluginApiRoute = z.infer<typeof apiRouteSchema>;
export type PluginWebhook = z.infer<typeof webhookSchema>;

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
  // Optional JSON Schema (draft-07) describing per-workspace configuration. The install UI renders a
  // form from it (shared adapterConfigFields helper) and setPluginConfig validates against it.
  configSchema: z.record(z.string(), z.unknown()).optional(),
  // Extensibility residuals (§3) — additive/optional. A plugin can declare UI extension slots, scoped
  // API routes, and inbound webhooks. Absent on legacy manifests (they stay valid).
  ui: z.array(uiSlotSchema).optional(),
  apiRoutes: z.array(apiRouteSchema).optional(),
  webhooks: z.array(webhookSchema).optional(),
});

export type PluginManifest = z.infer<typeof manifestSchema>;
export type ValidateResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; errors: string[] };

/** Pure: validate a manifest payload. Never throws. */
export function validateManifest(input: unknown): ValidateResult {
  const parsed = manifestSchema.safeParse(input);
  if (parsed.success) return { ok: true, manifest: parsed.data };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}
