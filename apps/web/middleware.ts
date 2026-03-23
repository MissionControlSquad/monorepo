import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getClientIp } from "./app/api/_lib/client-ip";

const COOKIE_NAME = "mc_session";

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
  "/favicon.ico",
  "/logo.png",
  "/robots.txt",
  "/manifest.json",
]);

const PUBLIC_PREFIXES = [
  "/api/auth/", // Auth endpoints (login, logout, setup, status)
  "/api/license", // License activation (public — before auth)
  "/api/events/", // Agent event ingestion (Bearer token auth in handler)
  "/api/agents/me", // Agent-scoped "me" routes (Bearer token auth in handler)
  "/api/cron/", // Cron jobs (CRON_SECRET auth in handler)
  "/api/health", // Health check (public)
  "/_next/", // Static assets
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
  if (!isRateLimitExempt(pathname)) {
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
    // API requests get 401, page requests get redirected
    if (pathname.startsWith("/api/")) {
      return withRequestId(
        NextResponse.json({ error: "Authentication required" }, { status: 401 }),
      );
    }
    return withRequestId(NextResponse.redirect(new URL("/login", request.url)));
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
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.cookies.delete(COOKIE_NAME);
    return withRequestId(response);
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
