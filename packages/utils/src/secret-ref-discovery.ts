/**
 * Secret-ref DISCOVERY (parity §3 secrets depth — json-schema secret-ref auto-binding). Given a
 * draft-07 JSON Schema that uses the repo's vault-pointer convention (a property marked
 * `format: "secret-ref"` or `x-secret-ref: true`; the same convention `json-schema-form.ts` reads),
 * return every secret-ref field's dotted path. A config screen can then auto-offer a SecretBinding
 * for each — the user picks a Secret + projection instead of typing a raw credential.
 *
 * Complements `secret-refs.ts` (which walks VALUES) — this walks the SCHEMA. Pure + I/O-free, so the
 * same discovery runs on server (preflight) and client (render). Nested objects and arrays are both
 * traversed: an object nests with a dotted segment; an array descends into its `items` with a `[]`
 * segment (e.g. `servers[].apiKey`), so one path represents the field on every array element.
 *
 * Not a validator and not a $ref resolver: it reports where secret-ref fields live, nothing more.
 */

/** A discovered secret-ref field: its dotted path plus the schema's human-facing hints. */
export interface SecretRefFieldInfo {
  /** Dotted path from the schema root; array levels are the segment `[]`, e.g. `auth.token`, `hooks[].secret`. */
  path: string;
  title?: string;
  description?: string;
  /** True when the field is listed in its parent object's `required` array. */
  required: boolean;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** The vault-pointer marker — identical to the convention json-schema-form.ts renders. */
function isSecretRefSchema(p: Record<string, unknown>): boolean {
  return p.format === "secret-ref" || p["x-secret-ref"] === true;
}

function join(prefix: string, segment: string): string {
  return prefix ? `${prefix}.${segment}` : segment;
}

/**
 * Pure: every secret-ref field in a JSON Schema, with hints, ordered by discovery (depth-first,
 * property order). Unknown/invalid input → []. Guards against cyclic schemas via a visited set.
 */
export function discoverSecretRefFields(schema: unknown): SecretRefFieldInfo[] {
  const out: SecretRefFieldInfo[] = [];
  const seen = new Set<object>();

  const walk = (node: unknown, prefix: string, required: boolean): void => {
    const s = asRecord(node);
    if (!s) return;
    if (seen.has(s)) return; // cycle guard ($ref loops / reused sub-schemas)
    seen.add(s);

    // A secret-ref leaf: record it and stop (a pointer has no sub-fields to bind).
    if (isSecretRefSchema(s)) {
      out.push({
        path: prefix,
        title: typeof s.title === "string" ? s.title : undefined,
        description: typeof s.description === "string" ? s.description : undefined,
        required,
      });
      return;
    }

    // Object: descend into each property, carrying the required-set of THIS level.
    const props = asRecord(s.properties);
    if (props) {
      const req = new Set(
        Array.isArray(s.required) ? (s.required as unknown[]).map(String) : [],
      );
      for (const [key, child] of Object.entries(props)) {
        walk(child, join(prefix, key), req.has(key));
      }
    }

    // Array: descend into items (single schema or a tuple) under a `[]` segment appended directly to
    // the path (e.g. `hooks` → `hooks[]`). An array element is never "required" in the parent sense,
    // so required resets to false at the boundary.
    const items = s.items;
    const arrayPath = `${prefix}[]`;
    if (Array.isArray(items)) {
      for (const it of items) walk(it, arrayPath, false);
    } else if (items) {
      walk(items, arrayPath, false);
    }
  };

  // Root has no path segment; a root that is itself a secret-ref is unusual but handled (path "").
  walk(schema, "", false);
  return out;
}

/** Pure convenience: just the dotted paths of every secret-ref field (see discoverSecretRefFields). */
export function discoverSecretRefPaths(schema: unknown): string[] {
  return discoverSecretRefFields(schema).map((f) => f.path);
}
