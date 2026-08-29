import BuildBase from "@buildbase/sdk";
import { cookies } from "next/headers";

/**
 * buildbase server-side factory (Epic #1) — the canonical way to call buildbase from the server:
 * auth() (current user + workspace), workspace, subscription/plans, usage/credits (quota),
 * features (flags), notification, settings. Per the official buildbase Claude skill golden path
 * (github.com/buildbase-app/claude-skill → knowledge/patterns/nextjs-integration.md).
 *
 * Constructed LAZILY and only when buildbase is configured (non-empty orgId) so the app never
 * throws on import while credentials are absent. Env names follow the MissionControlSquad website
 * convention (SAAS_*), with the skill's BUILDBASE_* names accepted as a fallback.
 */
export const BB_SESSION_COOKIE = "bb-session-id";
/** App-minted, workspace-scoped JWT cookie (host-only, pinned to TENANT_WORKSPACE_ID). Canonical name. */
export const WORKSPACE_TOKEN_COOKIE = "bb-workspace-token";

/**
 * Read a single cookie value from a raw `Cookie` request header. Returns null when absent. The one
 * canonical request-cookie parser — used by resolveTenancy, usage recording, and the auth routes so the
 * `(?:^|;\s*)name=` regex isn't hand-copied per file.
 */
export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const SERVER_URL =
  process.env.SAAS_SERVER_URL ||
  process.env.NEXT_PUBLIC_SAAS_SERVER_URL ||
  process.env.NEXT_PUBLIC_BUILDBASE_SERVER_URL ||
  "https://api.console.buildbase.app";

const ORG_ID =
  process.env.SAAS_ORG_ID ||
  process.env.NEXT_PUBLIC_SAAS_ORG_ID ||
  process.env.NEXT_PUBLIC_BUILDBASE_ORG_ID ||
  "";

/** True when buildbase credentials are configured. */
export function isBuildbaseConfigured(): boolean {
  return Boolean(ORG_ID);
}

let _factory: ReturnType<typeof BuildBase> | null = null;

/** Returns the buildbase server factory, or null when buildbase is not configured. */
export function getBuildbase(): ReturnType<typeof BuildBase> | null {
  if (!ORG_ID) return null;
  if (!_factory) {
    _factory = BuildBase({
      serverUrl: SERVER_URL,
      orgId: ORG_ID,
      getSessionId: async () => {
        try {
          const store = await cookies();
          return store.get(BB_SESSION_COOKIE)?.value ?? null;
        } catch {
          // Called outside a request scope (e.g. WS/background) — no cookie available.
          return null;
        }
      },
    });
  }
  return _factory;
}
