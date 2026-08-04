import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { GET as LIST, POST as CREATE } from "../../app/api/budgets/route";
import { GET as GET_ONE, PATCH, DELETE } from "../../app/api/budgets/[id]/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";

// Epic #4 R3: budget-policy CRUD over REST must reach parity with GraphQL — session-authenticated,
// admin-gated writes, workspace-scoped. Drives the real route handlers with a workspace JWT.
const SECRET = "budgets-rest-secret";
const WS = "ws_budgetsrest";
const OTHER_WS = "ws_budgetsrest_other";

async function req(
  method: string,
  body?: unknown,
  role: "admin" | "member" = "admin",
  workspaceId = WS,
) {
  const token = await createJWT({ userId: "u1", workspaceId, userRole: role, email: "u@x.com" }, SECRET);
  const headers: Record<string, string> = { Cookie: `bb-workspace-token=${token}` };
  if (body) headers["Content-Type"] = "application/json";
  return new Request("http://test/api/budgets", {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function json(res: Response) {
  return { status: res.status, body: JSON.parse(await res.text()) };
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});

beforeEach(async () => {
  await prisma.budgetPolicy.deleteMany({ where: { workspaceId: { in: [WS, OTHER_WS] } } });
  await prisma.featureFlag.upsert({
    where: { key: "budgets" },
    create: { key: "budgets", enabled: true, managedBy: "user" },
    update: { enabled: true },
  });
  invalidateFlagCache();
});

describe("REST /api/budgets (parity with GraphQL)", () => {
  it("admin can create → list → get → patch → delete", async () => {
    const created = await json(
      await CREATE(await req("POST", { scope: "workspace", name: "Monthly cap", limitCents: 50000, window: "monthly" })),
    );
    expect(created.status).toBe(201);
    const id = created.body.policy.id;
    expect(created.body.policy.limitCents).toBe(50000);

    const list = await json(await LIST(await req("GET", undefined, "member")));
    expect(list.status).toBe(200);
    expect(list.body.policies.map((p: any) => p.id)).toContain(id);

    const one = await json(await GET_ONE(await req("GET", undefined, "member"), { params: Promise.resolve({ id }) }));
    expect(one.status).toBe(200);
    expect(one.body.policy.name).toBe("Monthly cap");

    const patched = await json(
      await PATCH(await req("PATCH", { limitCents: 75000, isActive: false }), { params: Promise.resolve({ id }) }),
    );
    expect(patched.status).toBe(200);
    expect(patched.body.policy.limitCents).toBe(75000);
    expect(patched.body.policy.isActive).toBe(false);

    const del = await json(await DELETE(await req("DELETE"), { params: Promise.resolve({ id }) }));
    expect(del.status).toBe(200);
    expect(del.body.ok).toBe(true);
  });

  it("a member cannot create, patch, or delete (admin-gated writes)", async () => {
    const c = await json(await CREATE(await req("POST", { scope: "workspace", name: "x", limitCents: 100, window: "daily" }, "member")));
    expect(c.status).toBe(403);
  });

  it("returns 401 with no session/token", async () => {
    const res = await LIST(new Request("http://test/api/budgets", { method: "GET" }));
    expect(res.status).toBe(401);
  });

  it("validates required fields (400)", async () => {
    const c = await json(await CREATE(await req("POST", { scope: "workspace" })));
    expect(c.status).toBe(400);
  });

  it("cannot read another workspace's policy (404, not 403)", async () => {
    const created = await json(
      await CREATE(await req("POST", { scope: "workspace", name: "wsA", limitCents: 1000, window: "daily" })),
    );
    const id = created.body.policy.id;
    const cross = await GET_ONE(await req("GET", undefined, "member", OTHER_WS), { params: Promise.resolve({ id }) });
    expect(cross.status).toBe(404);
  });
});
