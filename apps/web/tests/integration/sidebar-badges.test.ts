import { describe, it, expect, beforeAll } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";

/**
 * Paperclip parity — sidebarBadges actionable counts. Approvals are workspace-scoped, so a fresh
 * workspace gives an isolated, exact assertion; review is a superset that must include them.
 */
const SECRET = "sidebar-badge-secret";
const WS = "ws_sidebar_badges";

async function gql(query: string, cookie: string) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ query }),
  });
  return JSON.parse(await (await POST(req)).text()) as { data?: any; errors?: any[] };
}

describe("sidebarBadges (Paperclip parity)", () => {
  let profileId: string;
  beforeAll(async () => {
    process.env.SYSTEM_SECRET = SECRET;
    const p = await prisma.profile.create({ data: { kind: "human", displayName: "Badge U" } });
    profileId = p.id;
  });

  it("counts pending approvals for the workspace and includes them in review", async () => {
    await prisma.approval.deleteMany({ where: { workspaceId: WS } });
    await prisma.approval.create({
      data: {
        workspaceId: WS,
        subjectType: "task",
        subjectId: "t1",
        title: "Needs sign-off",
        status: "pending",
        requestedById: profileId,
      },
    });
    await prisma.approval.create({
      data: {
        workspaceId: WS,
        subjectType: "task",
        subjectId: "t2",
        title: "Already done",
        status: "approved",
        requestedById: profileId,
      },
    });

    const token = await createJWT(
      { userId: profileId, workspaceId: WS, userRole: "admin" },
      SECRET,
    );
    const res = await gql(
      `query{ sidebarBadges{ approvals review attention } }`,
      `bb-workspace-token=${token}`,
    );
    expect(res.errors).toBeFalsy();
    expect(res.data.sidebarBadges.approvals).toBe(1); // only the pending one
    expect(res.data.sidebarBadges.review).toBeGreaterThanOrEqual(1); // review ⊇ approvals
    expect(res.data.sidebarBadges.attention).toBeGreaterThanOrEqual(0);
  });

  it("is denied without authentication", async () => {
    const res = await gql(`query{ sidebarBadges{ approvals } }`, "");
    expect(res.errors).toBeDefined();
  });
});
