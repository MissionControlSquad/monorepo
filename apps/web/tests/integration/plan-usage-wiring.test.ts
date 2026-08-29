import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { USAGE_QUOTA_SLUGS } from "../../src/lib/quota-slugs";

/**
 * Buildbase HUMAN plan-quota recording is wired on every create path that consumes a plan-limited
 * resource. This proves the two paths that previously enforced the license limit but SKIPPED the
 * buildbase `usage.record` call:
 *   - REST `POST /api/agents/batch-create` — records `agents` with quantity = batch size.
 *   - GraphQL `createProject` (the human dashboard path) — records `projects`, quantity 1.
 *
 * Buildbase is mocked (no network): `usage.record` is a spy. A human is simulated with a
 * bb-session-id + bb-workspace-token cookie pair (the same shape resolveUsageContext expects).
 */
const SECRET = "plan-usage-wiring-secret";
const WS = "ws_plan_usage";

const usageRecordMock = vi.fn(async () => ({
  consumed: 1,
  included: 100,
  available: 99,
  overage: 0,
}));
vi.mock("@/server/tenancy/buildbase", () => ({
  BB_SESSION_COOKIE: "bb-session-id",
  WORKSPACE_TOKEN_COOKIE: "bb-workspace-token",
  readCookie: (h: string | null | undefined, n: string) =>
    h ? (h.match(new RegExp(`(?:^|;\\s*)${n}=([^;]+)`))?.[1] ?? null) : null,
  isBuildbaseConfigured: () => true,
  getBuildbase: () => ({ withSession: () => ({ usage: { record: usageRecordMock } }) }),
}));

import { POST as BATCH_CREATE } from "../../app/api/agents/batch-create/route";
import { POST as GRAPHQL } from "../../app/api/graphql/route";

async function humanCookie(role: "admin" | "member") {
  const token = await createJWT({ userId: `u_${role}`, workspaceId: WS, userRole: role }, SECRET);
  return `bb-session-id=sess-human; bb-workspace-token=${token}`;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE agents, projects, project_members, profiles CASCADE`,
  );
  usageRecordMock.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("plan-usage recording — create paths", () => {
  it("batch-create records the `agents` quota with quantity = batch size", async () => {
    const body = {
      agents: [
        { name: "Usage One", role: "worker", username: "usage_one" },
        { name: "Usage Two", role: "worker", username: "usage_two" },
        { name: "Usage Three", role: "worker", username: "usage_three" },
      ],
    };
    const req = new Request("http://test/api/agents/batch-create", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: await humanCookie("admin") },
      body: JSON.stringify(body),
    });
    const res = await BATCH_CREATE(req as never, undefined as never);
    expect(res.status).toBe(201);
    expect(usageRecordMock).toHaveBeenCalledTimes(1);
    expect(usageRecordMock).toHaveBeenCalledWith(
      WS,
      expect.objectContaining({ quotaSlug: USAGE_QUOTA_SLUGS.agents, quantity: 3 }),
    );
  });

  it("GraphQL createProject records the `projects` quota (human path)", async () => {
    const CREATE_PROJECT = `mutation($n:String!){ createProject(name:$n){ id } }`;
    const req = new Request("http://test/api/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: await humanCookie("member") },
      body: JSON.stringify({ query: CREATE_PROJECT, variables: { n: "Usage Project" } }),
    });
    const res = await GRAPHQL(req);
    const json = JSON.parse(await res.text()) as { data?: any; errors?: unknown };
    expect(json.errors).toBeFalsy();
    expect(json.data?.createProject?.id).toBeTruthy();
    expect(usageRecordMock).toHaveBeenCalledWith(
      WS,
      expect.objectContaining({ quotaSlug: USAGE_QUOTA_SLUGS.projects, quantity: 1 }),
    );
  });

  it("does NOT record when there is no human buildbase session (agent/anon caller)", async () => {
    // No bb-session-id cookie → resolveUsageContext returns null → skip. Use an admin workspace token
    // only (still authorizes the ADMIN-gated route) but omit the session id.
    const token = await createJWT(
      { userId: "u_admin", workspaceId: WS, userRole: "admin" },
      SECRET,
    );
    const req = new Request("http://test/api/agents/batch-create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `bb-workspace-token=${token}`, // no bb-session-id
      },
      body: JSON.stringify({ agents: [{ name: "No Sess", role: "worker", username: "no_sess" }] }),
    });
    const res = await BATCH_CREATE(req as never, undefined as never);
    expect(res.status).toBe(201);
    expect(usageRecordMock).not.toHaveBeenCalled();
  });
});
