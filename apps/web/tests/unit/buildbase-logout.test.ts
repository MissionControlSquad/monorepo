import { describe, it, expect } from "vitest";

// Signing out of buildbase must clear BOTH the app session (mc_session) and the buildbase cookies, so
// a bridged user is fully signed out; and the app (operator) logout must clear the buildbase cookies
// too. These are the counterpart to the auth bridge that mints mc_session for buildbase users.

function parseSetCookieNames(res: Response): string[] {
  // Node's Headers merges duplicate Set-Cookie via getSetCookie().
  const all =
    typeof (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get("set-cookie") ?? ""];
  return all.filter(Boolean);
}

describe("POST /api/auth/buildbase/logout", () => {
  it("clears mc_session AND the buildbase session/workspace cookies (all expired)", async () => {
    const { POST } = await import("../../app/api/auth/buildbase/logout/route");
    const res = await POST();
    const cookies = parseSetCookieNames(res);
    const joined = cookies.join("\n");

    expect(joined).toContain("mc_session=;");
    expect(joined).toContain("bb-session-id=;");
    expect(joined).toContain("bb-workspace-token=;");
    // Every clear is an immediate expiry.
    for (const c of cookies) expect(c).toContain("Max-Age=0");
  });
});

describe("POST /api/auth/logout (operator)", () => {
  it("clears mc_session AND the buildbase cookies", async () => {
    const { POST } = await import("../../app/api/auth/logout/route");
    const res = await POST();
    const joined = parseSetCookieNames(res).join("\n");
    expect(joined).toContain("mc_session=;");
    expect(joined).toContain("bb-session-id=;");
    expect(joined).toContain("bb-workspace-token=;");
  });
});
