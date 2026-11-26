import { describe, it, expect, vi, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { LicenseStatusCode } from "../../src/server/constants";
import { getLicenseStatus, UNLIMITED } from "../../src/server/license";
import { GET as getLicenseRoute } from "../../app/api/license/route";

/**
 * The hosted license server at agentcenter.cloud is gone. Self-hosted installs must keep working
 * forever: always active, nothing limited, and no network calls of any kind.
 */

const WEB_ROOT = path.resolve(__dirname, "../..");

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("license (open source, no license server)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is always active with no limits and no expiry", () => {
    const status = getLicenseStatus();
    expect(status.status).toBe(LicenseStatusCode.ACTIVE);
    expect(status.maxAgents).toBe(UNLIMITED);
    expect(status.maxProjects).toBe(UNLIMITED);
    expect(status.maxSeats).toBe(UNLIMITED);
    expect(status.expiresAt).toBeNull();
    expect(UNLIMITED).toBe(-1); // the value older clients treat as "no limit"
  });

  it("stays active regardless of leftover license env vars", () => {
    vi.stubEnv("LICENSE_SERVER_URL", "https://admin.app.agentcenter.cloud");
    vi.stubEnv("LICENSE_REFRESH_TOKEN", "leftover");
    vi.stubEnv("LICENSE_PUBLIC_KEY", "leftover");
    vi.stubEnv("NODE_ENV", "production");
    expect(getLicenseStatus().status).toBe(LicenseStatusCode.ACTIVE);
    vi.unstubAllEnvs();
  });

  it("never makes a network call", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    getLicenseStatus();
    getLicenseStatus();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a fresh object each time so callers can't change the shared status", () => {
    const first = getLicenseStatus();
    first.status = LicenseStatusCode.EXPIRED;
    first.maxAgents = 1;
    first.features.push("tampered");
    const second = getLicenseStatus();
    expect(second.status).toBe(LicenseStatusCode.ACTIVE);
    expect(second.maxAgents).toBe(UNLIMITED);
    expect(second.features).toEqual([]);
  });

  it("GET /api/license reports the same active, unlimited status for older clients", async () => {
    const res = getLicenseRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(getLicenseStatus());
  });

  it("no longer exposes license activation or refresh", async () => {
    const route = await import("../../app/api/license/route");
    expect("POST" in route).toBe(false);
    expect("DELETE" in route).toBe(false);
    expect(fs.existsSync(path.join(WEB_ROOT, "app/api/license/refresh/route.ts"))).toBe(false);
    expect(fs.existsSync(path.join(WEB_ROOT, "app/(auth)/activate/page.tsx"))).toBe(false);
  });

  it("no app or server code talks to the old license server", () => {
    const offenders = [
      ...listSourceFiles(path.join(WEB_ROOT, "app")),
      ...listSourceFiles(path.join(WEB_ROOT, "src")),
      path.join(WEB_ROOT, "middleware.ts"),
      path.join(WEB_ROOT, "instrumentation.ts"),
    ].filter((file) => {
      const src = fs.readFileSync(file, "utf-8");
      return (
        /LICENSE_SERVER_URL|LICENSE_REFRESH_TOKEN|LICENSE_PUBLIC_KEY|LICENSE_DEV_BYPASS/.test(src) ||
        /agentcenter\.cloud\/api\/license|\/api\/license\/(activate|token|public-key)/.test(src) ||
        /\b(isLicenseActive|checkLicenseLimit|isFeatureLicensed|initLicense|activateLicenseKey)\b/.test(src)
      );
    });
    expect(offenders.map((f) => path.relative(WEB_ROOT, f))).toEqual([]);
  });
});
