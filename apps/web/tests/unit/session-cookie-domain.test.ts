import { describe, it, expect, afterEach, vi } from "vitest";

// getSessionCookieOptions() reads the validated env once at import time, so exercise each state with a
// fresh module graph (resetModules + dynamic import) after stubbing AUTH_COOKIE_DOMAIN.
async function loadCookieOptions(domain?: string) {
  vi.resetModules();
  if (domain === undefined) {
    delete process.env.AUTH_COOKIE_DOMAIN;
  } else {
    process.env.AUTH_COOKIE_DOMAIN = domain;
  }
  const mod = await import("../../src/server/admin-auth");
  return mod.getSessionCookieOptions();
}

afterEach(() => {
  delete process.env.AUTH_COOKIE_DOMAIN;
  vi.resetModules();
});

describe("getSessionCookieOptions — AUTH_COOKIE_DOMAIN", () => {
  it("omits Domain (host-only) when AUTH_COOKIE_DOMAIN is unset — local dev / self-host unchanged", async () => {
    const opts = await loadCookieOptions(undefined);
    expect(opts).not.toHaveProperty("domain");
    // Baseline flags preserved.
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
    expect(opts.path).toBe("/");
  });

  it("applies Domain for cross-subdomain SSO when AUTH_COOKIE_DOMAIN is set", async () => {
    const opts = await loadCookieOptions(".agentcenter.cloud");
    expect(opts).toHaveProperty("domain", ".agentcenter.cloud");
  });

  it("treats a blank AUTH_COOKIE_DOMAIN as unset", async () => {
    const opts = await loadCookieOptions("   ");
    expect(opts).not.toHaveProperty("domain");
  });
});
