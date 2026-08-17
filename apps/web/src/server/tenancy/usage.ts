import {
  getBuildbase,
  isBuildbaseConfigured,
  BB_SESSION_COOKIE,
  WORKSPACE_TOKEN_COOKIE,
  readCookie,
} from "./buildbase";
import { verifyJWT } from "@/lib/jwt";
import type { UsageQuotaSlug } from "@/lib/quota-slugs";

/**
 * Server-side HUMAN / workspace PLAN usage recording (Epic #1, SaaS plane).
 *
 * Records consumption of a customer's plan quota (e.g. `agents`, `projects`) into buildbase at the
 * moment a plan-limited resource is successfully created, via
 * `getBuildbase().withSession(sessionId).usage.record(workspaceId, { quotaSlug, quantity })`.
 *
 * Contract:
 *  - BEST-EFFORT + FAIL-SAFE: a recording failure (network, misconfig, no session) MUST NEVER break
 *    the create. Every path is wrapped and swallows errors.
 *  - DORMANT until configured: no-ops entirely when buildbase is not configured
 *    (`isBuildbaseConfigured()` false) or when no human buildbase session/workspace is present on the
 *    request (e.g. agent-authenticated or admin-bootstrap calls).
 *  - This is the human plan quota — NOT the AI-agent LLM/run budget (finance.prisma). Keep separate.
 */

/** The human buildbase identity resolved from a request's cookies, if a real workspace session exists. */
export interface UsageContext {
  sessionId: string;
  workspaceId: string;
}

/**
 * Resolve the buildbase session id + workspace id from a request's cookies. Returns null when either
 * is missing/invalid — i.e. the caller is not an authenticated buildbase human (agents, CLI keys and
 * the admin-bootstrap fallback all resolve to null and simply skip recording).
 */
export async function resolveUsageContext(request: Request): Promise<UsageContext | null> {
  try {
    const cookieHeader = request.headers.get("cookie");
    const sessionId = readCookie(cookieHeader, BB_SESSION_COOKIE);
    const token = readCookie(cookieHeader, WORKSPACE_TOKEN_COOKIE);
    const secret = process.env.SYSTEM_SECRET;
    if (!sessionId || !token || !secret) return null;

    const claims = await verifyJWT(token, secret);
    const workspaceId = typeof claims?.workspaceId === "string" ? claims.workspaceId : "";
    if (!workspaceId) return null;

    return { sessionId, workspaceId };
  } catch {
    return null;
  }
}

export interface RecordPlanUsageInput {
  sessionId: string;
  workspaceId: string;
  quotaSlug: UsageQuotaSlug | string;
  /** Units consumed. Defaults to 1 (one resource created). */
  quantity?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Record plan usage against buildbase. Guarded + fail-safe. Returns `true` when a record call was
 * actually issued, `false` when it was skipped (unconfigured) — never throws.
 *
 * Pure enough to unit-test by mocking `getBuildbase` / `isBuildbaseConfigured`.
 */
export async function recordPlanUsage(input: RecordPlanUsageInput): Promise<boolean> {
  try {
    if (!isBuildbaseConfigured()) return false;
    const bb = getBuildbase();
    if (!bb) return false;

    await bb.withSession(input.sessionId).usage.record(input.workspaceId, {
      quotaSlug: input.quotaSlug,
      quantity: input.quantity ?? 1,
      source: input.source ?? "web-app",
      metadata: input.metadata,
    });
    return true;
  } catch (err) {
    // Best-effort: a recording failure must never surface to the create flow.
    console.warn("[usage] recordPlanUsage failed (non-fatal):", err);
    return false;
  }
}

/**
 * Convenience wrapper for REST routes: resolve the human buildbase session from the request and
 * record one unit of the given plan quota. No-ops (and never throws) for non-human callers or when
 * buildbase is not configured. Call AFTER the resource has been successfully created.
 */
export async function recordPlanUsageFromRequest(
  request: Request,
  opts: {
    quotaSlug: UsageQuotaSlug | string;
    quantity?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<boolean> {
  try {
    if (!isBuildbaseConfigured()) return false;
    const ctx = await resolveUsageContext(request);
    if (!ctx) return false;
    return await recordPlanUsage({
      sessionId: ctx.sessionId,
      workspaceId: ctx.workspaceId,
      quotaSlug: opts.quotaSlug,
      quantity: opts.quantity,
      metadata: opts.metadata,
    });
  } catch (err) {
    console.warn("[usage] recordPlanUsageFromRequest failed (non-fatal):", err);
    return false;
  }
}
