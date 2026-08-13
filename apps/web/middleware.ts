import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getClientIp } from "./app/api/_lib/client-ip";

const COOKIE_NAME = "mc_session";
// buildbase session cookie set by BOTH this app's /api/auth/buildbase/token route AND the landing
// site (same buildbase org). Its presence without an mc_session triggers server-side auto-SSO.
const BB_SESSION_COOKIE = "bb-session-id";
// The query param the buildbase SDK appends on the OAuth callback (BB_PARAM = "bb"), carrying the
// encoded auth code the SDK exchanges for a session.
const BB_CALLBACK_PARAM = "bb";

/**
 * Build the /login redirect URL, PRESERVING the buildbase OAuth callback param (?bb=…) if present.
 * buildbase redirects the signed-in user back to APP_URL ("/") with ?bb=<code>; that hits the
 * middleware with no session yet, and a bare redirect to /login would DROP the param — so the SDK
 * never exchanges the code and the user is stuck at {sessionId:null}. Carrying ?bb through to /login
 * lets the SDK provider (mounted app-wide) consume it there and mint the session.
 */
function buildLoginUrl(request: NextRequest): URL {
  const url = new URL("/login", request.url);
  const bb = request.nextUrl.searchParams.get(BB_CALLBACK_PARAM);
  if (bb) url.searchParams.set(BB_CALLBACK_PARAM, bb);
  return url;
}

function getSecret() {
  const raw = process.env.AUTH_SECRET;
  if (!raw && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET environment variable is required in production");
  }
  return new TextEncoder().encode(raw || "mc-dev-secret-change-in-production");
}

// ---------------------------------------------------------------------------
// Global in-memory rate limiter (Edge-compatible, per-process)
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000; // 60 seconds
const RATE_LIMIT_MAX = 300; // requests per window per IP (safety net — per-route limiters are tighter)

// E2E/CI escape hatch. Under Playwright, several parallel workers drive the served app from a single
// shared client IP, and each page load fans out into many requests (SSR + GraphQL + polling). That
// trips this per-IP safety net non-deterministically, surfacing as full-page "Too Many Requests"
// responses and aborted GraphQL loads (a body of `{error}` not `{data}`). Gated on a flag set ONLY in
// the e2e workflow's app env (.github/workflows/e2e.yaml) — never in dev/prod, so real traffic stays
// limited. Mirrors SEED_BYPASS_RATE_LIMIT / NODE_ENV=test in app/api/_lib/rate-limit-check.ts.
const RATE_LIMIT_DISABLED = process.env.E2E_RATE_LIMIT_DISABLED === "1";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

// Periodically clean up stale entries (every 60s)
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (entry.resetAt <= now) {
      rateLimitMap.delete(key);
    }
  }
}, 60_000);
if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
  (cleanupTimer as NodeJS.Timeout).unref();
}

const RATE_LIMIT_EXEMPT_PREFIXES = ["/_next/", "/api/health"];

function isRateLimitExempt(pathname: string): boolean {
  for (const prefix of RATE_LIMIT_EXEMPT_PREFIXES) {
    if (pathname.startsWith(prefix)) return true;
  }
  return false;
}

function checkGlobalRateLimit(ip: string): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  let entry = rateLimitMap.get(ip);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(ip, entry);
    return { limited: false, retryAfter: 0 };
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { limited: true, retryAfter };
  }

  return { limited: false, retryAfter: 0 };
}

// ---------------------------------------------------------------------------
// Auth routing
// ---------------------------------------------------------------------------

/**
 * Routes that are explicitly PUBLIC (no auth required).
 * Everything else requires admin session auth (closed-by-default).
 */
const PUBLIC_EXACT = new Set([
  "/login",
  "/setup",
  "/activate",
  "/reset-password",
  "/no-access", // Cross-tenant deny page (buildbase user who isn't a member of this workspace)
  "/favicon.ico",
  "/logo.png",
  "/robots.txt",
  "/manifest.json",
]);

const PUBLIC_PREFIXES = [
  "/api/auth/", // Auth endpoints (buildbase token/session/sso/logout, status)
  "/api/test/", // TEST-ONLY session bootstrap — the route itself 404s unless NODE_ENV=test (fail-closed)
  "/api/license", // License activation (public — before auth)
  "/api/events/", // Agent event ingestion (Bearer token auth in handler)
  "/api/agents/me", // Agent-scoped "me" routes (Bearer token auth in handler)
  "/api/cron/", // Cron jobs (CRON_SECRET auth in handler)
  "/api/health", // Health check (public)
  "/_next/", // Static assets
  "/live-gateway", // WebSocket endpoint — auth handled by custom server
];

/** Agent-scoped REST routes that use their own Bearer token auth in the handler. */
const AGENT_BEARER_PREFIXES = [
  "/api/tasks",
  "/api/messages",
  "/api/notifications",
  "/api/projects",
  "/api/queue",
  "/api/storage",
  "/api/channels",
  "/api/cost-events", // Epic #4: agents report inference cost via Bearer key (resolveAgent in handler)
];

/** Admin-only routes under /api/agents/[id]/ that require session auth. */
const ADMIN_AGENT_PATTERN =
  /^\/api\/agents\/[^/]+\/(regenerate-key|setup|config-bundle|request-config-upgrade)$/;

/** Exported for unit tests. Returns true if the path requires admin session. */
export function requiresAdminAuth(pathname: string): boolean {
  // Exact public paths
  if (PUBLIC_EXACT.has(pathname)) return false;

  // Public prefixes
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return false;
  }

  // Agent-scoped REST API routes use Bearer token auth in handler
  for (const prefix of AGENT_BEARER_PREFIXES) {
    if (pathname.startsWith(prefix)) return false;
  }

  // Admin-only agent sub-routes (regenerate-key, setup, config-bundle, request-config-upgrade)
  if (ADMIN_AGENT_PATTERN.test(pathname)) return true;

  // GET /api/agents (list) uses Bearer auth in handler
  if (pathname === "/api/agents") return false;

  // All remaining routes require admin auth (closed-by-default)
  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for WebSocket upgrade requests (graphql-ws subscriptions).
  // Auth is handled by the custom server's WS context instead.
  if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return NextResponse.next();
  }

  // --- Request Correlation ID ---
  const requestId = crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  // --- Global Rate Limiting ---
  if (!RATE_LIMIT_DISABLED && !isRateLimitExempt(pathname)) {
    const ip = getClientIp(request.headers);
    const { limited, retryAfter } = checkGlobalRateLimit(ip);

    if (limited) {
      const headers = {
        "Retry-After": String(retryAfter),
        "x-request-id": requestId,
      };
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers });
      }
      return new NextResponse("Too Many Requests", { status: 429, headers });
    }
  }

  // Helper to attach correlation ID to any response
  function withRequestId(response: NextResponse): NextResponse {
    response.headers.set("x-request-id", requestId);
    return response;
  }

  if (!requiresAdminAuth(pathname)) {
    return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }));
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    // Auto-SSO: the user has a buildbase session (e.g. from the landing site) but no app session yet.
    // Hand off to the server-side sso route, which validates the buildbase session, upserts the
    // Profile, mints mc_session, and redirects back to the originally-requested path — no login step.
    // Edge middleware can't do DB/network work, so it only routes here. Page navigations only; API
    // callers get a 401 (the browser page will have bridged first). The sso route is public
    // (/api/auth/* allowlist) so this never loops; on failure it lands on /login.
    const hasBuildbaseSession = Boolean(request.cookies.get(BB_SESSION_COOKIE)?.value);
    if (hasBuildbaseSession && !pathname.startsWith("/api/")) {
      const returnTo = pathname + request.nextUrl.search;
      const ssoUrl = new URL("/api/auth/buildbase/sso", request.url);
      ssoUrl.searchParams.set("returnTo", returnTo);
      return withRequestId(NextResponse.redirect(ssoUrl));
    }

    // API requests get 401, page requests get redirected
    if (pathname.startsWith("/api/")) {
      return withRequestId(
        NextResponse.json({ error: "Authentication required" }, { status: 401 }),
      );
    }
    return withRequestId(NextResponse.redirect(buildLoginUrl(request)));
  }

  try {
    await jwtVerify(token, getSecret());
    return withRequestId(NextResponse.next({ request: { headers: requestHeaders } }));
  } catch {
    // Invalid or expired token — clear it
    if (pathname.startsWith("/api/")) {
      const response = NextResponse.json({ error: "Session expired" }, { status: 401 });
      response.cookies.delete(COOKIE_NAME);
      return withRequestId(response);
    }
    const response = NextResponse.redirect(buildLoginUrl(request));
    response.cookies.delete(COOKIE_NAME);
    return withRequestId(response);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
