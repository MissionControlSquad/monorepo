import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";

/**
 * Company-wide artifacts gallery (workspaceDeliverables) — real GraphQL route + Postgres.
 * Workspace-scoped (via task's project) + optional kind filter.
 */
const SECRET = "wsdeliv-secret";
const WS_A = "ws_deliv_A";
const WS_B = "ws_deliv_B";

async function gql(query: string, variables?: Record<string, unknown>, cookie?: string) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  return text ? (JSON.parse(text) as { data?: any; errors?: any[] }) : { errors: [] };
}
async function cookieFor(workspaceId: string, role: "admin" | "member") {
  const token = await createJWT({ userId: "human_1", workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}
const Q = `query($k:String){ workspaceDeliverables(kind:$k){ id title kind task{ taskNumber } } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE deliverables, tasks, projects, agents, profiles CASCADE`,
  );
});

async function makeDeliverable(ws: string, title: string, kind: "markdown" | "file") {
  const project = await prisma.project.create({ data: { name: "P", workspaceId: ws } });
  const task = await prisma.task.create({
    data: { title: "T", description: "d", projectId: project.id },
  });
  const profile = await prisma.profile.create({ data: { kind: "agent", displayName: "A" } });
  await prisma.deliverable.create({
    data: { taskId: task.id, profileId: profile.id, projectId: project.id, title, kind },
  });
}

describe("workspaceDeliverables", () => {
  it("lists the workspace's artifacts and filters by kind", async () => {
    await makeDeliverable(WS_A, "readme", "markdown");
    await makeDeliverable(WS_A, "logo.png", "file");
    const admin = await cookieFor(WS_A, "member");

    const all = await gql(Q, {}, admin);
    expect(all.errors).toBeFalsy();
    expect(all.data.workspaceDeliverables).toHaveLength(2);

    const files = await gql(Q, { k: "file" }, admin);
    expect(files.data.workspaceDeliverables).toHaveLength(1);
    expect(files.data.workspaceDeliverables[0].title).toBe("logo.png");
  });

  it("is workspace-scoped and rejects an invalid kind + the unauthenticated", async () => {
    await makeDeliverable(WS_A, "secret-doc", "markdown");
    const other = await gql(Q, {}, await cookieFor(WS_B, "member"));
    expect(other.data.workspaceDeliverables).toHaveLength(0);

    const bad = await gql(Q, { k: "video" }, await cookieFor(WS_A, "member"));
    expect(bad.errors).toBeDefined();

    const anon = await gql(Q, {});
    expect(anon.errors).toBeDefined();
    expect(anon.data?.workspaceDeliverables).toBeFalsy();
  });
});
