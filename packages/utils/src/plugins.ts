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
