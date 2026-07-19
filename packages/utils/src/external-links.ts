/**
 * Pure helpers for Tier C external object links. Import from @agentcenter/utils. Classifies a URL by
 * host (github/gitlab/url) and validates it — no network, no side effects.
 */
export type ExternalLinkKind = "github" | "gitlab" | "url";

/** Validate an http(s) URL. Returns the parsed URL or null. */
export function parseHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** Classify a URL by host into an ExternalLinkKind. Non-http or unknown → "url". */
export function classifyExternalLink(raw: string): ExternalLinkKind {
  const u = parseHttpUrl(raw);
  if (!u) return "url";
  const host = u.hostname.toLowerCase();
  if (host === "github.com" || host.endsWith(".github.com")) return "github";
  if (host === "gitlab.com" || host.endsWith(".gitlab.com")) return "gitlab";
  return "url";
}
