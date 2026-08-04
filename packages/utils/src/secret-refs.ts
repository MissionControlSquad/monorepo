// Secret-ref resolution (parity #93 — json-schema-secret-refs). A config value can carry a vault
// pointer `{ secretRef: { name } }` instead of a literal secret, so plaintext is never persisted.
// These helpers walk ANY JSON-schema config (nested objects + arrays), not just a flat map:
//   - collectSecretRefs — every referenced name (preflight validation),
//   - resolveSecretRefs  — swap pointers for values at use-time (server-side, injected resolver),
//   - maskSecretRefs     — render for the client as `secret:<name>`, never a value.
// Pure (the resolver is injected), so it's reusable across adapters/plugins/environments + testable.

export interface SecretRef {
  secretRef: { name: string };
}

export function isSecretRef(value: unknown): value is SecretRef {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const ref = (value as { secretRef?: unknown }).secretRef;
  return (
    typeof ref === "object" &&
    ref !== null &&
    typeof (ref as { name?: unknown }).name === "string" &&
    (ref as { name: string }).name.length > 0
  );
}

/** Every distinct secret name referenced anywhere in `value` (recursively). */
export function collectSecretRefs(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (isSecretRef(value)) {
    acc.add(value.secretRef.name);
    return acc;
  }
  if (Array.isArray(value)) {
    for (const el of value) collectSecretRefs(el, acc);
    return acc;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectSecretRefs(v, acc);
  }
  return acc;
}

/**
 * Resolve every `{ secretRef }` in `value` to its plaintext via `resolveSecret`, recursively.
 * On a missing secret, `onMissing` decides: throw (default), or return a fallback string. Structure
 * (objects/arrays/scalars) is otherwise preserved.
 */
export async function resolveSecretRefs<T>(
  value: T,
  resolveSecret: (name: string) => Promise<string | null>,
  opts: { onMissing?: (name: string) => string } = {},
): Promise<T> {
  const onMissing =
    opts.onMissing ??
    ((name: string) => {
      throw new Error(`config references a missing secret: ${name}`);
    });

  const walk = async (v: unknown): Promise<unknown> => {
    if (isSecretRef(v)) {
      const resolved = await resolveSecret(v.secretRef.name);
      return resolved == null ? onMissing(v.secretRef.name) : resolved;
    }
    if (Array.isArray(v)) return Promise.all(v.map(walk));
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) out[k] = await walk(val);
      return out;
    }
    return v;
  };

  return (await walk(value)) as T;
}

/** Client-safe view: every `{ secretRef: { name } }` becomes the string `secret:<name>`. */
export function maskSecretRefs(value: unknown): unknown {
  if (isSecretRef(value)) return `secret:${value.secretRef.name}`;
  if (Array.isArray(value)) return value.map(maskSecretRefs);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = maskSecretRefs(v);
    return out;
  }
  return value;
}
