import { describe, it, expect, vi, beforeEach } from "vitest";
import { LicenseStatusCode } from "../../src/server/constants";
import crypto from "crypto";

// ── Generate a test RSA key pair ────────────────────────────────

const { publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY } = crypto.generateKeyPairSync(
  "rsa",
  {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  },
);

// ── Clear VITEST env BEFORE module evaluation ───────────────────
// IS_TEST = !!process.env.VITEST is captured at module load time.
// vi.hoisted runs before vi.mock and module imports.
vi.hoisted(() => {
  delete process.env.VITEST;
});

// ── Mock @agentcenter/database ──────────────────────────────────
// license.ts imports getStoredLicense, upsertLicenseRecord, deleteLicenseRecord, etc.
// from @agentcenter/database, which internally uses prisma. We mock at the package level.

const mockFindUnique = vi.fn();
const mockUpsert = vi.fn();
const mockDeleteMany = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@agentcenter/database", () => ({
  getStoredLicense: (...args: unknown[]) => mockFindUnique(...args),
  upsertLicenseRecord: (...args: unknown[]) => mockUpsert(...args),
  deleteLicenseRecord: (...args: unknown[]) => mockDeleteMany(...args),
  updateLicenseAccessToken: (...args: unknown[]) => mockUpdate(...args),
  markLicenseRecordRevoked: vi.fn(),
}));

// ── Mock filesystem (no real keys on disk) ──────────────────────

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn().mockReturnValue(false),
      readFileSync: vi.fn().mockReturnValue(""),
      writeFileSync: vi.fn(),
    },
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn().mockReturnValue(""),
    writeFileSync: vi.fn(),
  };
});

// Set env vars before importing the module
process.env.LICENSE_PUBLIC_KEY = TEST_PUBLIC_KEY;
process.env.LICENSE_SERVER_URL = "https://test-license-server.example.com";

// ── Import after mocks ─────────────────────────────────────────

import {
  verifyAccessToken,
  getLicenseStatus,
  isLicenseActive,
  isFeatureLicensed,
  checkLicenseLimit,
  clearStoredLicense,
  invalidateLicenseCache,
  type AccessTokenPayload,
} from "../../src/server/license";

// ── Helpers ─────────────────────────────────────────────────────

function b64url(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function signToken(payload: Record<string, unknown>): string {
  const header = { alg: "RS256", typ: "LICENSE" };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(TEST_PRIVATE_KEY, "base64url");

  return `${signingInput}.${signature}`;
}

function makeAccessToken(overrides: Partial<AccessTokenPayload> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = {
    typ: "access",
    lid: "lic_test123",
    sub: "test-client",
    org: "Test Org",
    plan: "pro",
    maxAgents: 25,
    maxProjects: 50,
    maxSeats: 10,
    features: ["channels", "documents", "agent_queue"],
    iat: now,
    exp: now + 86400, // 24h
    iss: "agentcenter.cloud",
    ...overrides,
  };
  return signToken(payload as unknown as Record<string, unknown>);
}

function makeStoredLicense(tokenOverrides: Partial<AccessTokenPayload> = {}) {
  const token = makeAccessToken(tokenOverrides);
  const now = Math.floor(Date.now() / 1000);
  return {
    id: "active",
    token: "refresh_token_here",
    instanceId: token,
    plan: tokenOverrides.plan ?? "pro",
    org: tokenOverrides.org ?? "Test Org",
    maxAgents: tokenOverrides.maxAgents ?? 25,
    maxProjects: tokenOverrides.maxProjects ?? 50,
    maxSeats: tokenOverrides.maxSeats ?? 10,
    features: tokenOverrides.features ?? ["channels", "documents", "agent_queue"],
    expiresAt: new Date((tokenOverrides.exp ?? now + 86400) * 1000),
    lastVerifiedAt: new Date(),
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe("license module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateLicenseCache();
  });

  // ── verifyAccessToken ───────────────────────────────────────

  describe("verifyAccessToken", () => {
    it("returns payload for a valid, non-expired token", () => {
      const token = makeAccessToken();
      const payload = verifyAccessToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.typ).toBe("access");
      expect(payload!.plan).toBe("pro");
      expect(payload!.org).toBe("Test Org");
      expect(payload!.features).toEqual(["channels", "documents", "agent_queue"]);
    });

    it("returns null for an expired token (default behavior)", () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeAccessToken({ iat: now - 86400, exp: now - 3600 }); // expired 1h ago
      const payload = verifyAccessToken(token);
      expect(payload).toBeNull();
    });

    it("returns payload for an expired token when ignoreExpiry is true", () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeAccessToken({ iat: now - 86400, exp: now - 3600 });
      const payload = verifyAccessToken(token, { ignoreExpiry: true });
      expect(payload).not.toBeNull();
      expect(payload!.plan).toBe("pro");
    });

    it("returns null for a tampered token", () => {
      const token = makeAccessToken();
      const parts = token.split(".");
      // Corrupt the payload (middle section) to invalidate the signature
      parts[1] = parts[1].slice(0, -4) + "XXXX";
      const tampered = parts.join(".");
      expect(verifyAccessToken(tampered)).toBeNull();
    });

    it("returns null for a token with wrong typ", () => {
      const token = signToken({
        typ: "refresh",
        lid: "lic_test",
        sub: "test",
        iat: Math.floor(Date.now() / 1000),
        iss: "agentcenter.cloud",
      });
      expect(verifyAccessToken(token)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(verifyAccessToken("")).toBeNull();
    });

    it("returns null for malformed token (wrong number of parts)", () => {
      expect(verifyAccessToken("abc.def")).toBeNull();
      expect(verifyAccessToken("abc.def.ghi.jkl")).toBeNull();
    });

    it("returns null for a token signed with a different key", () => {
      const { privateKey: otherKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });

      const now = Math.floor(Date.now() / 1000);
      const header = { alg: "RS256", typ: "LICENSE" };
      const payload = {
        typ: "access",
        lid: "lic_test",
        sub: "test",
        org: "Test",
        plan: "pro",
        maxAgents: 5,
        maxProjects: 10,
        maxSeats: 3,
        features: [],
        iat: now,
        exp: now + 86400,
        iss: "agentcenter.cloud",
      };
      const headerB64 = b64url(JSON.stringify(header));
      const payloadB64 = b64url(JSON.stringify(payload));
      const signingInput = `${headerB64}.${payloadB64}`;
      const sign = crypto.createSign("RSA-SHA256");
      sign.update(signingInput);
      const signature = sign.sign(otherKey, "base64url");
      const token = `${signingInput}.${signature}`;

      expect(verifyAccessToken(token)).toBeNull();
    });

    it("correctly extracts all payload fields", () => {
      const token = makeAccessToken({
        plan: "enterprise",
        maxAgents: -1,
        maxProjects: -1,
        maxSeats: -1,
        features: ["channels", "analytics", "cloud_vms"],
      });
      const payload = verifyAccessToken(token);
      expect(payload).not.toBeNull();
      expect(payload!.plan).toBe("enterprise");
      expect(payload!.maxAgents).toBe(-1);
      expect(payload!.maxProjects).toBe(-1);
      expect(payload!.maxSeats).toBe(-1);
      expect(payload!.features).toEqual(["channels", "analytics", "cloud_vms"]);
    });

    it("returns payload for token expiring in the future", () => {
      const now = Math.floor(Date.now() / 1000);
      const token = makeAccessToken({ exp: now + 1 }); // expires in 1 second
      expect(verifyAccessToken(token)).not.toBeNull();
    });
  });

  // ── getLicenseStatus ────────────────────────────────────────

  describe("getLicenseStatus", () => {
    it("returns 'none' when no license in DB", async () => {
      mockFindUnique.mockResolvedValue(null);
      const status = await getLicenseStatus();
      expect(status.status).toBe(LicenseStatusCode.NONE);
      expect(status.plan).toBeNull();
    });

    it("returns 'active' for valid non-expired license", async () => {
      mockFindUnique.mockResolvedValue(makeStoredLicense());
      const status = await getLicenseStatus();
      expect(status.status).toBe(LicenseStatusCode.ACTIVE);
      expect(status.plan).toBe("pro");
      expect(status.features).toEqual(["channels", "documents", "agent_queue"]);
    });

    it("returns 'revoked' when plan is 'revoked'", async () => {
      mockFindUnique.mockResolvedValue({
        ...makeStoredLicense(),
        plan: "revoked",
      });
      const status = await getLicenseStatus();
      expect(status.status).toBe(LicenseStatusCode.REVOKED);
    });

    it("returns 'invalid' when no access token stored", async () => {
      mockFindUnique.mockResolvedValue({
        ...makeStoredLicense(),
        instanceId: null,
      });
      const status = await getLicenseStatus();
      expect(status.status).toBe(LicenseStatusCode.INVALID);
    });

    it("returns 'active' within grace period (expired < 3 days)", async () => {
      const now = Math.floor(Date.now() / 1000);
      // Expired 1 day ago — within 3-day grace period
      mockFindUnique.mockResolvedValue(makeStoredLicense({ exp: now - 86400 }));
      const status = await getLicenseStatus();
      expect(status.status).toBe(LicenseStatusCode.ACTIVE);
      expect(status.message).toContain("renewal pending");
    });

    it("returns 'expired' after grace period (expired > 3 days)", async () => {
      const now = Math.floor(Date.now() / 1000);
      // Expired 4 days ago — past 3-day grace period
      mockFindUnique.mockResolvedValue(makeStoredLicense({ exp: now - 4 * 86400 }));
      const status = await getLicenseStatus();
      expect(status.status).toBe(LicenseStatusCode.EXPIRED);
    });

    it("includes correct limits in status", async () => {
      mockFindUnique.mockResolvedValue(
        makeStoredLicense({ maxAgents: 5, maxProjects: 10, maxSeats: 3 }),
      );
      const status = await getLicenseStatus();
      expect(status.maxAgents).toBe(5);
      expect(status.maxProjects).toBe(10);
      expect(status.maxSeats).toBe(3);
    });
  });

  // ── isLicenseActive ─────────────────────────────────────────

  describe("isLicenseActive", () => {
    it("returns true when license is active", async () => {
      mockFindUnique.mockResolvedValue(makeStoredLicense());
      invalidateLicenseCache();
      const active = await isLicenseActive();
      expect(active).toBe(true);
    });

    it("returns false when no license exists", async () => {
      mockFindUnique.mockResolvedValue(null);
      invalidateLicenseCache();
      const active = await isLicenseActive();
      expect(active).toBe(false);
    });

    it("returns false when license is revoked", async () => {
      mockFindUnique.mockResolvedValue({
        ...makeStoredLicense(),
        plan: "revoked",
      });
      invalidateLicenseCache();
      const active = await isLicenseActive();
      expect(active).toBe(false);
    });
  });

  // ── isFeatureLicensed ───────────────────────────────────────

  describe("isFeatureLicensed", () => {
    it("returns true for a licensed feature", async () => {
      mockFindUnique.mockResolvedValue(makeStoredLicense());
      invalidateLicenseCache();
      const licensed = await isFeatureLicensed("channels");
      expect(licensed).toBe(true);
    });

    it("returns false for an unlicensed feature", async () => {
      mockFindUnique.mockResolvedValue(makeStoredLicense());
      invalidateLicenseCache();
      const licensed = await isFeatureLicensed("cloud_vms");
      expect(licensed).toBe(false);
    });

    it("returns false when no license exists", async () => {
      mockFindUnique.mockResolvedValue(null);
      invalidateLicenseCache();
      const licensed = await isFeatureLicensed("channels");
      expect(licensed).toBe(false);
    });
  });

  // ── checkLicenseLimit ───────────────────────────────────────

  describe("checkLicenseLimit", () => {
    it("allows when under the limit", async () => {
      mockFindUnique.mockResolvedValue(makeStoredLicense({ maxAgents: 10 }));
      invalidateLicenseCache();
      const result = await checkLicenseLimit("agents", 5);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10);
    });

    it("blocks when at the limit", async () => {
      mockFindUnique.mockResolvedValue(makeStoredLicense({ maxAgents: 5 }));
      invalidateLicenseCache();
      const result = await checkLicenseLimit("agents", 5);
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(5);
    });

    it("blocks when over the limit", async () => {
      mockFindUnique.mockResolvedValue(makeStoredLicense({ maxAgents: 5 }));
      invalidateLicenseCache();
      const result = await checkLicenseLimit("agents", 10);
      expect(result.allowed).toBe(false);
    });

    it("always allows when limit is -1 (unlimited)", async () => {
      mockFindUnique.mockResolvedValue(makeStoredLicense({ maxAgents: -1 }));
      invalidateLicenseCache();
      const result = await checkLicenseLimit("agents", 9999);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1);
    });

    it("checks project limits", async () => {
      mockFindUnique.mockResolvedValue(makeStoredLicense({ maxProjects: 3 }));
      invalidateLicenseCache();
      const result = await checkLicenseLimit("projects", 3);
      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(3);
    });

    it("checks seat limits", async () => {
      mockFindUnique.mockResolvedValue(makeStoredLicense({ maxSeats: 10 }));
      invalidateLicenseCache();
      const result = await checkLicenseLimit("seats", 8);
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10);
    });
  });

  // ── Cache behavior ──────────────────────────────────────────

  describe("status cache", () => {
    it("caches status for 60 seconds", async () => {
      mockFindUnique.mockResolvedValue(makeStoredLicense());
      invalidateLicenseCache();

      await isLicenseActive();
      await isLicenseActive();
      await isLicenseActive();

      // Should only query DB once due to cache
      expect(mockFindUnique).toHaveBeenCalledTimes(1);
    });

    it("invalidateLicenseCache forces re-query", async () => {
      mockFindUnique.mockResolvedValue(makeStoredLicense());
      invalidateLicenseCache();

      await isLicenseActive();
      expect(mockFindUnique).toHaveBeenCalledTimes(1);

      invalidateLicenseCache();
      await isLicenseActive();
      expect(mockFindUnique).toHaveBeenCalledTimes(2);
    });
  });

  // ── clearStoredLicense ──────────────────────────────────────

  describe("clearStoredLicense", () => {
    it("calls deleteLicenseRecord with correct ID", async () => {
      mockDeleteMany.mockResolvedValue(undefined);
      await clearStoredLicense();
      expect(mockDeleteMany).toHaveBeenCalledWith("active");
    });
  });
});
