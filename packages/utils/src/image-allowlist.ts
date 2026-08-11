/**
 * Container image allowlist (sandbox security hardening — Item 2). Pure + isomorphic.
 *
 * The kubernetes sandbox provider boots a pod from a container image that is workspace-configurable
 * (the `K8S_SANDBOX_IMAGE` vault secret, or a spec override). Without a guard, a workspace member could
 * point a run at ANY image — including a hostile one that exfiltrates the injected credentials. This
 * evaluator decides whether an image reference is permitted under a glob/registry allowlist BEFORE the
 * pod is created; a disallowed image is refused with a readable reason.
 *
 * Patterns are shell-style globs matched against the FULL image reference (`registry/repo:tag`):
 *   - `*`  matches any run of characters (including `/` and `:`),
 *   - `?`  matches a single character,
 *   - a bare `registry.example.com/*` pins an allowed registry,
 *   - an exact ref (`ubuntu:22.04`) pins one image.
 * A leading `!` negates (a deny rule): a matching deny pattern refuses the image even if an allow
 * pattern also matches (deny wins), so an allowlist can carve exceptions out of a broad allow.
 */

/** A sensible default allowlist — common public base images from trusted registries. Workspaces can
 * override it entirely via the `K8S_IMAGE_ALLOWLIST` vault secret (comma/space/newline separated). */
export const DEFAULT_IMAGE_ALLOWLIST: readonly string[] = [
  // official Docker Hub library images (unqualified refs like `ubuntu:22.04` resolve here)
  "ubuntu:*",
  "debian:*",
  "alpine:*",
  "node:*",
  "python:*",
  "golang:*",
  "docker.io/library/*",
  // GitHub Container Registry (common for org base images)
  "ghcr.io/*",
];

export interface ImageAllowlistDecision {
  allowed: boolean;
  reason?: string;
}

/** Compile a single glob pattern (no leading `!`) to an anchored RegExp over the whole image ref. */
function globToRegExp(glob: string): RegExp {
  let out = "";
  for (const ch of glob) {
    if (ch === "*") out += ".*";
    else if (ch === "?") out += ".";
    else out += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/** Pure: does `image` match a single allowlist pattern? Ignores the `!` prefix (caller handles deny). */
export function imageMatchesPattern(image: string, pattern: string): boolean {
  const glob = pattern.startsWith("!") ? pattern.slice(1) : pattern;
  if (!glob) return false;
  return globToRegExp(glob.trim()).test(image.trim());
}

/**
 * Pure: evaluate an image reference against an allowlist. Deny rules (`!pattern`) win over allow rules.
 * With NO allow rules configured (empty/only-deny list) the decision is DENY (fail-closed) — a
 * misconfigured empty allowlist must never silently permit everything. A blank image ref is refused.
 */
export function evaluateImageAllowlist(
  allowlist: readonly string[],
  image: string,
): ImageAllowlistDecision {
  const ref = image.trim();
  if (!ref) return { allowed: false, reason: "No container image was specified for the run." };

  const denies = allowlist.filter((p) => p.startsWith("!"));
  const allows = allowlist.filter((p) => p.trim() && !p.startsWith("!"));

  for (const d of denies) {
    if (imageMatchesPattern(ref, d)) {
      return {
        allowed: false,
        reason: `Image "${ref}" is explicitly denied by the workspace image allowlist (rule "${d}").`,
      };
    }
  }
  if (allows.length === 0) {
    return {
      allowed: false,
      reason: `Image "${ref}" is not permitted — the workspace image allowlist has no allow rules configured.`,
    };
  }
  for (const a of allows) {
    if (imageMatchesPattern(ref, a)) return { allowed: true };
  }
  return {
    allowed: false,
    reason: `Image "${ref}" is not on the workspace image allowlist. Allowed: ${allows.join(", ")}. Configure K8S_IMAGE_ALLOWLIST to permit it.`,
  };
}

/**
 * Pure: parse a workspace-provided allowlist string (the `K8S_IMAGE_ALLOWLIST` secret) into patterns.
 * Entries are separated by commas, whitespace, or newlines; blanks are dropped. A null/blank input
 * falls back to {@link DEFAULT_IMAGE_ALLOWLIST} so an unconfigured workspace still gets a sane guard.
 */
export function parseImageAllowlist(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [...DEFAULT_IMAGE_ALLOWLIST];
  const parts = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [...DEFAULT_IMAGE_ALLOWLIST];
}
