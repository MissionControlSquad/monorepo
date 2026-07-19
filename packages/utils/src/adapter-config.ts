/**
 * Adapter config form fields (Epic #2) — shared across all apps (web/desktop/mobile). Import from
 * @agentcenter/utils. Pure: turns an adapter's JSON Schema (draft-07, as stored on
 * AgentAdapter.configSchema) into flat field descriptors so the per-agent adapterConfig form renders
 * identically everywhere. The server still authoritatively validates via the adapter registry; this
 * only shapes the UI. No I/O.
 */

export type AdapterFieldType = "string" | "number" | "boolean" | "enum";

export interface AdapterConfigField {
  key: string;
  label: string;
  type: AdapterFieldType;
  required: boolean;
  description?: string;
  default?: string | number | boolean;
  enumValues?: string[];
  /** password-style — a token/secret the UI should mask. */
  secret: boolean;
}

const SECRET_KEY_RE = /token|secret|key|password/i;

/** Pure: derive ordered form fields from an adapter's JSON Schema. Unknown/invalid input → []. */
export function adapterConfigFields(configSchema: unknown): AdapterConfigField[] {
  if (!configSchema || typeof configSchema !== "object") return [];
  const schema = configSchema as Record<string, unknown>;
  const props = schema.properties;
  if (!props || typeof props !== "object") return [];
  const required = new Set(
    Array.isArray(schema.required) ? (schema.required as unknown[]).map(String) : [],
  );

  const fields: AdapterConfigField[] = [];
  for (const [key, raw] of Object.entries(props as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const enumValues = Array.isArray(p.enum) ? (p.enum as unknown[]).map(String) : undefined;

    let type: AdapterFieldType = "string";
    if (enumValues && enumValues.length > 0) type = "enum";
    else if (p.type === "number" || p.type === "integer") type = "number";
    else if (p.type === "boolean") type = "boolean";

    const def = p.default;
    fields.push({
      key,
      label: typeof p.title === "string" ? p.title : key,
      type,
      required: required.has(key),
      description: typeof p.description === "string" ? p.description : undefined,
      default:
        typeof def === "string" || typeof def === "number" || typeof def === "boolean"
          ? def
          : undefined,
      enumValues,
      secret: p.writeOnly === true || p.format === "password" || SECRET_KEY_RE.test(key),
    });
  }
  return fields;
}
