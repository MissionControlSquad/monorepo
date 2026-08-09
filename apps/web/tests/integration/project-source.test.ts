import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";

/**
 * Project source configuration — real GraphQL route + Postgres, workspace-scoped. Portable metadata
 * (sourceType/repoUrl/repoRef/visibility); repo fields only apply to a remote_repo source.
 */
const SECRET = "projsrc-secret";
const WS_A = "ws_src_A";
const WS_B = "ws_src_B";

async function gql(query: string, variables?: Record<string, unknown>, cookie?: string) {
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const res = await POST(req);
  const text = await res.text();
  return text
    ? (JSON.parse(text) as { data?: any; errors?: { message: string }[] })
    : { errors: [{ message: "empty" }] };
}

async function cookieFor(workspaceId: string, role: "admin" | "member") {
  const token = await createJWT({ userId: "human_1", workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

const SET = `mutation($p:String!,$s:String,$u:String,$r:String,$v:String){
  setProjectSource(projectId:$p, sourceType:$s, repoUrl:$u, repoRef:$r, visibility:$v){
    id sourceType repoUrl repoRef visibility } }`;

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE projects CASCADE`);
});

async function makeProject(ws: string) {
  const p = await prisma.project.create({ data: { name: "P", workspaceId: ws } });
  return p.id;
}

describe("setProjectSource", () => {
  it("sets a remote_repo source with url + ref and workspace visibility", async () => {
    const id = await makeProject(WS_A);
    const r = await gql(
      SET,
      { p: id, s: "remote_repo", u: "https://github.com/acme/repo", r: "main", v: "workspace" },
      await cookieFor(WS_A, "member"),
    );
    expect(r.errors).toBeFalsy();
    expect(r.data.setProjectSource).toMatchObject({
      sourceType: "remote_repo",
      repoUrl: "https://github.com/acme/repo",
      repoRef: "main",
      visibility: "workspace",
    });
  });

  it("clears repo fields when the source is not a remote_repo", async () => {
    const id = await makeProject(WS_A);
    await gql(
      SET,
      { p: id, s: "remote_repo", u: "https://x/y", r: "dev" },
      await cookieFor(WS_A, "member"),
    );
    const r = await gql(SET, { p: id, s: "local_git" }, await cookieFor(WS_A, "member"));
    expect(r.data.setProjectSource).toMatchObject({
      sourceType: "local_git",
      repoUrl: null,
      repoRef: null,
    });
  });

  it("rejects an invalid sourceType / visibility", async () => {
    const id = await makeProject(WS_A);
    const badType = await gql(SET, { p: id, s: "svn" }, await cookieFor(WS_A, "member"));
    expect(badType.errors).toBeDefined();
    const badVis = await gql(SET, { p: id, v: "public" }, await cookieFor(WS_A, "member"));
    expect(badVis.errors).toBeDefined();
  });

  it("is workspace-scoped: cannot configure another workspace's project", async () => {
    const id = await makeProject(WS_B);
    const r = await gql(SET, { p: id, s: "non_git" }, await cookieFor(WS_A, "member"));
    expect(r.errors).toBeDefined();
    const fresh = await prisma.project.findUniqueOrThrow({ where: { id } });
    expect(fresh.sourceType).toBeNull();
  });
});
