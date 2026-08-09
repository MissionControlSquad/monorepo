/**
 * JsonSchemaForm — pure model (keystone #3, Paperclip `JsonSchemaForm` parity). Shared across all apps
 * (web/desktop/mobile) via @agentcenter/utils. Turns a draft-07 object JSON Schema into flat field
 * descriptors AND validates a values object against it, so every rich config screen (environments,
 * adapters, plugins, secrets) renders + validates identically. The server still authoritatively
 * validates via zod / the relevant registry; this only shapes and pre-checks the UI. No I/O.
 *
 * Superset of `adapter-config.ts` (`adapterConfigFields`), which is kept as-is for back-compat. This
 * module adds: numeric/length/pattern constraints, placeholder, and the repo's `{secretRef:{name}}`
 * vault-pointer convention (a `secretRef` field renders a secret binding rather than a raw value).
 */

export type JsonSchemaFieldType = "string" | "number" | "boolean" | "enum";

export interface JsonSchemaFormField {
  key: string;
  label: string;
  type: JsonSchemaFieldType;
  required: boolean;
  description?: string;
  placeholder?: string;
  default?: string | number | boolean;
  enumValues?: string[];
  /** password-style — a token/secret the UI should mask. */
  secret: boolean;
  /** Vault-pointer field — value is shaped `{ secretRef: { name } }`, not a raw string. */
  secretRef: boolean;
  /** numeric constraints (number type only). */
  min?: number;
  max?: number;
  /** string constraints. */
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface JsonSchemaFormError {
  key: string;
  message: string;
}

const SECRET_KEY_RE = /token|secret|key|password/i;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function isSecretRef(p: Record<string, unknown>): boolean {
  return p.format === "secret-ref" || p["x-secret-ref"] === true;
}

/** Pure: derive ordered form fields from a draft-07 object JSON Schema. Unknown/invalid input → []. */
export function parseJsonSchema(schema: unknown): JsonSchemaFormField[] {
  const root = asRecord(schema);
  if (!root) return [];
  const props = asRecord(root.properties);
  if (!props) return [];
  const required = new Set(
    Array.isArray(root.required) ? (root.required as unknown[]).map(String) : [],
  );

  const fields: JsonSchemaFormField[] = [];
  for (const [key, raw] of Object.entries(props)) {
    const p = asRecord(raw);
    if (!p) continue;
    const enumValues = Array.isArray(p.enum) ? (p.enum as unknown[]).map(String) : undefined;

    let type: JsonSchemaFieldType = "string";
    if (enumValues && enumValues.length > 0) type = "enum";
    else if (p.type === "number" || p.type === "integer") type = "number";
    else if (p.type === "boolean") type = "boolean";

    const def = p.default;
    const secretRef = isSecretRef(p);
    fields.push({
      key,
      label: typeof p.title === "string" ? p.title : key,
      type,
      required: required.has(key),
      description: typeof p.description === "string" ? p.description : undefined,
      placeholder: typeof p.examples === "object" && Array.isArray(p.examples)
        ? p.examples.map(String)[0]
        : undefined,
      default:
        typeof def === "string" || typeof def === "number" || typeof def === "boolean"
          ? def
          : undefined,
      enumValues,
      secret: !secretRef && (p.writeOnly === true || p.format === "password" || SECRET_KEY_RE.test(key)),
      secretRef,
      min: num(p.minimum),
      max: num(p.maximum),
      minLength: num(p.minLength),
      maxLength: num(p.maxLength),
      pattern: typeof p.pattern === "string" ? p.pattern : undefined,
    });
  }
  return fields;
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === "";
}

/** Value of a possibly-secretRef field, for presence/validation. `{secretRef:{name}}` → the name. */
function effectiveValue(field: JsonSchemaFormField, value: unknown): unknown {
  if (!field.secretRef) return value;
  const rec = asRecord(value);
  const ref = rec && asRecord(rec.secretRef);
  return ref ? ref.name : undefined;
}

/**
 * Pure: validate a values object against the schema. Returns one error per offending field ([] = valid).
 * Checks: required, type, numeric min/max, string length, and pattern. Mirrors what the server enforces
 * so the UI can block a doomed submit early.
 */
export function validateJsonSchemaForm(
  schema: unknown,
  values: Record<string, unknown>,
): JsonSchemaFormError[] {
  const fields = parseJsonSchema(schema);
  const errors: JsonSchemaFormError[] = [];

  for (const field of fields) {
    const raw = values?.[field.key];
    const value = effectiveValue(field, raw);

    if (isEmpty(value)) {
      if (field.required) errors.push({ key: field.key, message: `${field.label} is required` });
      continue; // no further checks on an absent optional value
    }

    if (field.type === "number") {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) {
        errors.push({ key: field.key, message: `${field.label} must be a number` });
        continue;
      }
      if (field.min !== undefined && n < field.min)
        errors.push({ key: field.key, message: `${field.label} must be ≥ ${field.min}` });
      if (field.max !== undefined && n > field.max)
        errors.push({ key: field.key, message: `${field.label} must be ≤ ${field.max}` });
    } else if (field.type === "enum") {
      if (field.enumValues && !field.enumValues.includes(String(value)))
        errors.push({ key: field.key, message: `${field.label} must be one of the allowed values` });
    } else if (field.type === "string" && !field.secretRef) {
      const s = String(value);
      if (field.minLength !== undefined && s.length < field.minLength)
        errors.push({
          key: field.key,
          message: `${field.label} must be at least ${field.minLength} characters`,
        });
      if (field.maxLength !== undefined && s.length > field.maxLength)
        errors.push({
          key: field.key,
          message: `${field.label} must be at most ${field.maxLength} characters`,
        });
      if (field.pattern) {
        let re: RegExp | null = null;
        try {
          re = new RegExp(field.pattern);
        } catch {
          re = null; // malformed pattern in schema → skip (server is authoritative)
        }
        if (re && !re.test(s))
          errors.push({ key: field.key, message: `${field.label} is not in the expected format` });
      }
    }
  }
  return errors;
}

/**
 * Pure: return a copy of `values` with declared schema defaults filled in where a key is absent.
 * secretRef fields are never defaulted (a vault pointer has no sensible literal default).
 */
export function applyJsonSchemaDefaults(
  schema: unknown,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const field of parseJsonSchema(schema)) {
    if (field.secretRef) continue;
    if (field.default !== undefined && out[field.key] === undefined) out[field.key] = field.default;
  }
  return out;
}
