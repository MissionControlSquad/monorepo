import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware, requiresAdminAuth } from "../../middleware";

function req(path: string, cookie?: string) {
  return new NextRequest(new URL(`http://localhost:3000${path}`), {
    headers: cookie ? { cookie } : undefined,
  });
}

describe("buildbase auto-SSO routing (middleware)", () => {
  it("keeps the sso route (and all /api/auth/*) public so it never loops", () => {
    expect(requiresAdminAuth("/api/auth/buildbase/sso")).toBe(false);
    expect(requiresAdminAuth("/api/auth/buildbase/token")).toBe(false);
    expect(requiresAdminAuth("/api/auth/buildbase/logout")).toBe(false);
  });

  it("routes a page request WITH bb-session-id but NO mc_session to the sso handler", async () => {
    const res = await middleware(req("/kanban", "bb-session-id=sess_abc"));
    expect(res.status).toBe(307);
    const location = res.headers.get("location")!;
    const url = new URL(location);
    expect(url.pathname).toBe("/api/auth/buildbase/sso");
    expect(url.searchParams.get("returnTo")).toBe("/kanban");
  });

  it("preserves the original query string in returnTo", async () => {
    const res = await middleware(req("/task/123?tab=activity", "bb-session-id=sess_abc"));
    const url = new URL(res.headers.get("location")!);
    expect(url.searchParams.get("returnTo")).toBe("/task/123?tab=activity");
  });

  it("redirects to /login (not SSO) when there is NO buildbase session", async () => {
    const res = await middleware(req("/kanban"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("returns 401 (never a browser SSO redirect) for API requests even with a bb-session", async () => {
    const res = await middleware(req("/api/graphql", "bb-session-id=sess_abc"));
    expect(res.status).toBe(401);
  });

  it("lets an already-authenticated (mc_session) request through without SSO", async () => {
    // An unverifiable mc_session still means "don't auto-SSO"; the jose verify then decides. Here the
    // token is invalid, so it clears + redirects to /login — crucially NOT to the sso route.
    const res = await middleware(req("/kanban", "mc_session=not-a-real-jwt"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });
});
