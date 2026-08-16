/**
 * Live Gateway API Integration Tests
 *
 * Tests all REST endpoints under /api/live-gateway/:
 *   - GET  /api/live-gateway/tokens          — list active install tokens
 *   - POST /api/live-gateway/tokens          — generate a new install token
 *   - DELETE /api/live-gateway/tokens/[id]   — revoke an install token
 *   - GET  /api/live-gateway/connections     — list machine connections
 *   - DELETE /api/live-gateway/connections/[id] — remove an offline connection
 *
 * Each section tests: happy path, auth guard (no session → 401),
 * feature flag gate (flag off → 403), and relevant error cases.
 *
 * Sequential — each section builds on shared state from the previous one.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache, setTestFeature } from "../../src/server/feature-flags";
import { adminSetup, adminLogin, extractSessionCookie, buildRequest, callRoute } from "../helpers";

// ── Route handler imports ─────────────────────────────────────────────────────
import { GET as _listTokens, POST as _createToken } from "../../app/api/live-gateway/tokens/route";
import { DELETE as revokeToken } from "../../app/api/live-gateway/tokens/[id]/route";
import { GET as _listConnections } from "../../app/api/live-gateway/connections/route";
import { DELETE as deleteConnection } from "../../app/api/live-gateway/connections/[id]/route";

// These routes don't use ctx — cast to single-arg form so call sites are clean.
type SimpleHandler = (req: Request) => Promise<Response>;
const listTokens = _listTokens as SimpleHandler;
const createToken = _createToken as SimpleHandler;
const listConnections = _listConnections as SimpleHandler;

// ── Shared state ──────────────────────────────────────────────────────────────
let cookie: string;
let createdTokenId: string;
let createdConnectionId: string;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Use a unique IP per request so rate limiters never block test traffic.
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.99.${Math.floor(ipCounter / 255)}.${ipCounter % 255 || 1}`;
}

/** Build a session-authenticated request with a unique IP. */
function authed(method: string, url: string, body?: unknown): Request {
  return buildRequest(method, url, {
    headers: { cookie: `mc_session=${cookie}`, "x-forwarded-for": nextIp() },
    body,
  });
}

/** Build a request with NO session (unauthenticated), with a unique IP. */
function unauthed(method: string, url: string, body?: unknown): Request {
  return buildRequest(method, url, {
    headers: { "x-forwarded-for": nextIp() },
    body,
  });
}

/** Enable or disable the live_gateway feature flag and bust the cache. */
async function setLiveGatewayFlag(enabled: boolean) {
  setTestFeature("live_gateway", enabled);
  invalidateFlagCache();
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  // Create admin account and log in
  await adminSetup("lgw-admin", "Test1234!", "10.5.0.1");
  const loginRes = await adminLogin("lgw-admin", "Test1234!", "10.5.0.1");
  expect(loginRes.status).toBe(200);
  cookie = extractSessionCookie(loginRes) ?? "";
  expect(cookie).not.toBe("");

  // Enable the live_gateway feature flag for all tests
  await setLiveGatewayFlag(true);
});

afterAll(async () => {
  // Restore flag to disabled and clean up test data
  await setLiveGatewayFlag(false);
  await prisma.liveGatewayToken.deleteMany({});
  await prisma.liveGatewayConnection.deleteMany({});
  invalidateFlagCache();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. GET /api/live-gateway/tokens — list active tokens
// ════════════════════════════════════════════════════════════════════════════

describe("GET /api/live-gateway/tokens", () => {
  it("returns empty token list initially", async () => {
    const res = await listTokens(authed("GET", "/api/live-gateway/tokens"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tokens).toBeInstanceOf(Array);
    expect(data.tokens).toHaveLength(0);
  });

  it("returns 401 with no session", async () => {
    const res = await listTokens(unauthed("GET", "/api/live-gateway/tokens"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when live_gateway feature flag is disabled", async () => {
    await setLiveGatewayFlag(false);
    try {
      const res = await listTokens(authed("GET", "/api/live-gateway/tokens"));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.code).toBe("FEATURE_DISABLED");
    } finally {
      await setLiveGatewayFlag(true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. POST /api/live-gateway/tokens — generate a new token
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/live-gateway/tokens", () => {
  it("creates a token without a name", async () => {
    const res = await createToken(authed("POST", "/api/live-gateway/tokens", {}));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.token).toHaveLength(64); // 32 bytes → 64 hex chars
    expect(data.prefix).toHaveLength(8);
    expect(data.token).toMatch(/^[0-9a-f]{64}$/);
    expect(data.prefix).toBe(data.token.slice(0, 8));
    expect(data.name).toBeNull();
    expect(data.warning).toMatch(/Store this token securely/);
  });

  it("creates a token with a name", async () => {
    const res = await createToken(
      authed("POST", "/api/live-gateway/tokens", { name: "Production VM" }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.token).toHaveLength(64);
    expect(data.name).toBe("Production VM");

    // Save for later tests
    createdTokenId = (await prisma.liveGatewayToken.findFirst({
      where: { tokenPrefix: data.prefix },
    }))!.id;
    expect(createdTokenId).toBeTruthy();
  });

  it("rejects a name longer than 100 characters", async () => {
    const res = await createToken(
      authed("POST", "/api/live-gateway/tokens", { name: "x".repeat(101) }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an empty name string", async () => {
    const res = await createToken(authed("POST", "/api/live-gateway/tokens", { name: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 with no session", async () => {
    const res = await createToken(unauthed("POST", "/api/live-gateway/tokens", {}));
    expect(res.status).toBe(401);
  });

  it("returns 403 when feature flag is disabled", async () => {
    await setLiveGatewayFlag(false);
    try {
      const res = await createToken(authed("POST", "/api/live-gateway/tokens", {}));
      expect(res.status).toBe(403);
    } finally {
      await setLiveGatewayFlag(true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. GET /api/live-gateway/tokens — list after creation
// ════════════════════════════════════════════════════════════════════════════

describe("GET /api/live-gateway/tokens (after creation)", () => {
  it("lists created tokens with masked values", async () => {
    const res = await listTokens(authed("GET", "/api/live-gateway/tokens"));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.tokens.length).toBeGreaterThanOrEqual(2);

    const namedToken = data.tokens.find((t: any) => t.name === "Production VM");
    expect(namedToken).toBeDefined();
    expect(namedToken.prefix).toHaveLength(8);
    // maskedToken = prefix + 56 asterisks
    expect(namedToken.maskedToken).toMatch(/^[0-9a-f]{8}\*{56}$/);
    // Raw token must NOT appear
    expect(namedToken.maskedToken).not.toMatch(/^[0-9a-f]{64}$/);
  });

  it("each token has required fields: id, prefix, name, maskedToken", async () => {
    const res = await listTokens(authed("GET", "/api/live-gateway/tokens"));
    const { tokens } = await res.json();
    for (const t of tokens) {
      expect(t).toHaveProperty("id");
      expect(t).toHaveProperty("prefix");
      expect(t).toHaveProperty("name");
      expect(t).toHaveProperty("maskedToken");
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. DELETE /api/live-gateway/tokens/[id] — revoke a token
// ════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/live-gateway/tokens/[id]", () => {
  it("revokes an existing token", async () => {
    const req = authed("DELETE", `/api/live-gateway/tokens/${createdTokenId}`);
    const res = await callRoute(revokeToken, req, { id: createdTokenId });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.revoked).toBe(true);

    // Confirm it no longer appears in the active list
    const listRes = await listTokens(authed("GET", "/api/live-gateway/tokens"));
    const { tokens } = await listRes.json();
    expect(tokens.find((t: any) => t.id === createdTokenId)).toBeUndefined();
  });

  it("confirms revoked token has revokedAt set in DB", async () => {
    const dbToken = await prisma.liveGatewayToken.findUnique({
      where: { id: createdTokenId },
    });
    expect(dbToken?.isActive).toBe(false);
    expect(dbToken?.revokedAt).toBeTruthy();
  });

  it("returns 401 with no session", async () => {
    const req = unauthed("DELETE", `/api/live-gateway/tokens/${createdTokenId}`);
    const res = await callRoute(revokeToken, req, { id: createdTokenId });
    expect(res.status).toBe(401);
  });

  it("returns 403 when feature flag is disabled", async () => {
    await setLiveGatewayFlag(false);
    try {
      const req = authed("DELETE", `/api/live-gateway/tokens/${createdTokenId}`);
      const res = await callRoute(revokeToken, req, { id: createdTokenId });
      expect(res.status).toBe(403);
    } finally {
      await setLiveGatewayFlag(true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. GET /api/live-gateway/connections — list machine connections
// ════════════════════════════════════════════════════════════════════════════

describe("GET /api/live-gateway/connections", () => {
  beforeAll(async () => {
    // Seed a disconnected connection record directly in the DB
    const conn = await prisma.liveGatewayConnection.create({
      data: {
        machineFingerprint: "test-fp-abc123",
        machineName: "test-machine",
        connectionStatus: "disconnected",
        pluginVersion: "0.1.26",
        hostMeta: { hostname: "test-machine", platform: "linux", arch: "x64" },
        agentRoutes: {
          create: [{ agentSlug: "test-agent-1" }, { agentSlug: "test-agent-2" }],
        },
      },
    });
    createdConnectionId = conn.id;
  });

  it("returns connection list with correct shape", async () => {
    const res = await listConnections(authed("GET", "/api/live-gateway/connections"));
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.connections).toBeInstanceOf(Array);
    const conn = data.connections.find((c: any) => c.id === createdConnectionId);
    expect(conn).toBeDefined();
    expect(conn.machineName).toBe("test-machine");
    expect(conn.connectionStatus).toBe("disconnected");
    expect(conn.pluginVersion).toBe("0.1.26");
    expect(conn.agentSlugs).toEqual(expect.arrayContaining(["test-agent-1", "test-agent-2"]));
    expect(conn.agentSlugs).toHaveLength(2);
    expect(conn.createdAt).toBeTruthy();
  });

  it("each connection has required fields", async () => {
    const res = await listConnections(authed("GET", "/api/live-gateway/connections"));
    const { connections } = await res.json();
    for (const c of connections) {
      expect(c).toHaveProperty("id");
      expect(c).toHaveProperty("machineName");
      expect(c).toHaveProperty("connectionStatus");
      expect(c).toHaveProperty("connectedAt");
      expect(c).toHaveProperty("lastDisconnectedAt");
      expect(c).toHaveProperty("pluginVersion");
      expect(c).toHaveProperty("agentSlugs");
      expect(c).toHaveProperty("createdAt");
    }
  });

  it("returns 401 with no session", async () => {
    const res = await listConnections(unauthed("GET", "/api/live-gateway/connections"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when feature flag is disabled", async () => {
    await setLiveGatewayFlag(false);
    try {
      const res = await listConnections(authed("GET", "/api/live-gateway/connections"));
      expect(res.status).toBe(403);
    } finally {
      await setLiveGatewayFlag(true);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. DELETE /api/live-gateway/connections/[id] — remove an offline connection
// ════════════════════════════════════════════════════════════════════════════

describe("DELETE /api/live-gateway/connections/[id]", () => {
  it("returns 404 for a non-existent connection id", async () => {
    const fakeId = "nonexistent-connection-id";
    const req = authed("DELETE", `/api/live-gateway/connections/${fakeId}`);
    const res = await callRoute(deleteConnection, req, { id: fakeId });
    expect(res.status).toBe(404);
  });

  it("deletes an offline connection successfully", async () => {
    const req = authed("DELETE", `/api/live-gateway/connections/${createdConnectionId}`);
    const res = await callRoute(deleteConnection, req, { id: createdConnectionId });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Confirm it no longer appears in the list
    const listRes = await listConnections(authed("GET", "/api/live-gateway/connections"));
    const { connections } = await listRes.json();
    expect(connections.find((c: any) => c.id === createdConnectionId)).toBeUndefined();
  });

  it("returns 409 when connection is currently live in registry", async () => {
    // Create a fresh connection record
    const conn = await prisma.liveGatewayConnection.create({
      data: {
        machineFingerprint: "test-fp-live-xyz",
        machineName: "live-machine",
        connectionStatus: "connected",
      },
    });

    // Inject a mock entry into the global connectionRegistry
    const { connectionRegistry } =
      await import("../../src/server/services/live-connection-registry");
    const fakeWs = { readyState: 1, send: () => {} } as any;
    connectionRegistry.add({
      connectionId: conn.id,
      ws: fakeWs,
      connectedAt: new Date(),
      lastMessageAt: new Date(),
      pluginVersion: "0.1.26",
    });

    try {
      const req = authed("DELETE", `/api/live-gateway/connections/${conn.id}`);
      const res = await callRoute(deleteConnection, req, { id: conn.id });
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toMatch(/currently connected/i);
    } finally {
      connectionRegistry.remove(conn.id);
      await prisma.liveGatewayConnection.delete({ where: { id: conn.id } });
    }
  });

  it("returns 401 with no session", async () => {
    const req = unauthed("DELETE", `/api/live-gateway/connections/any-id`);
    const res = await callRoute(deleteConnection, req, { id: "any-id" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when feature flag is disabled", async () => {
    await setLiveGatewayFlag(false);
    try {
      const req = authed("DELETE", `/api/live-gateway/connections/any-id`);
      const res = await callRoute(deleteConnection, req, { id: "any-id" });
      expect(res.status).toBe(403);
    } finally {
      await setLiveGatewayFlag(true);
    }
  });
});
