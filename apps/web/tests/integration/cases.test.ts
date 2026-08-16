import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";

/**
 * Epic #17 cases — real GraphQL route + Postgres. `userId` is a real Profile id (case FKs). Proves
 * create/number/identifier/events, status lifecycle, task links, labels, doc attach, hierarchy,
 * workspace isolation, and the feature gate.
 */
const SECRET = "cases-test-secret";
const WS_A = "ws_cases_A";
const WS_B = "ws_cases_B";
let humanId = "";

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
  const token = await createJWT({ userId: humanId, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}
async function makeCase(ws: string, title = "Broken export") {
  return gql(
    `mutation($t:String!){ createCase(title:$t, caseType:"bug"){ id caseNumber identifier status } }`,
    { t: title },
    await cookieFor(ws, "member"),
  );
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE cases, labels, tasks, documents, profiles CASCADE`,
  );
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Case Human" } });
  humanId = p.id;
});

describe("case create + lifecycle (Epic #17)", () => {
  it("assigns a caseNumber + CASE-<n> identifier and records a created event", async () => {
    const r = await makeCase(WS_A);
    expect(r.errors).toBeFalsy();
    expect(r.data.createCase.identifier).toBe(`CASE-${r.data.createCase.caseNumber}`);
    expect(r.data.createCase.status).toBe("draft");
    const events = await prisma.caseEvent.findMany({ where: { caseId: r.data.createCase.id } });
    expect(events.map((e) => e.kind)).toContain("created");
  });

  it("done status stamps completedAt + a status_changed event; reopening clears completedAt", async () => {
    const id = (await makeCase(WS_A)).data.createCase.id;
    const member = await cookieFor(WS_A, "member");
    const done = await gql(
      `mutation($id:String!){ setCaseStatus(id:$id, status:"done"){ id status completedAt } }`,
      { id },
      member,
    );
    expect(done.data.setCaseStatus.completedAt).toBeTruthy();
    const reopened = await gql(
      `mutation($id:String!){ setCaseStatus(id:$id, status:"in_progress"){ completedAt } }`,
      { id },
      member,
    );
    expect(reopened.data.setCaseStatus.completedAt).toBeNull();
    const kinds = (await prisma.caseEvent.findMany({ where: { caseId: id } })).map((e) => e.kind);
    expect(kinds.filter((k) => k === "status_changed")).toHaveLength(2);
  });
});

describe("task links (Epic #17)", () => {
  it("links a task with a role (unique) and is found by casesForTask", async () => {
    const caseId = (await makeCase(WS_A)).data.createCase.id;
    const task = await prisma.task.create({ data: { title: "fix it", description: "d" } });
    const member = await cookieFor(WS_A, "member");
    const link = await gql(
      `mutation($c:String!,$t:String!){ linkTaskToCase(caseId:$c, taskId:$t, role:"origin"){ id role } }`,
      { c: caseId, t: task.id },
      member,
    );
    expect(link.data.linkTaskToCase.role).toBe("origin");
    // Duplicate rejected.
    const dup = await gql(
      `mutation($c:String!,$t:String!){ linkTaskToCase(caseId:$c, taskId:$t){ id } }`,
      { c: caseId, t: task.id },
      member,
    );
    expect(dup.errors).toBeDefined();
    // Reverse lookup.
    const rev = await gql(
      `query($t:String!){ casesForTask(taskId:$t){ id } }`,
      { t: task.id },
      member,
    );
    expect(rev.data.casesForTask.map((c: any) => c.id)).toEqual([caseId]);
  });
});

describe("labels (Epic #17)", () => {
  it("admin creates a catalog label (unique); member adds/removes it on a case", async () => {
    const caseId = (await makeCase(WS_A)).data.createCase.id;
    const admin = await cookieFor(WS_A, "admin");
    const label = await gql(
      `mutation{ createLabel(name:"urgent", color:"#f00"){ id name } }`,
      undefined,
      admin,
    );
    expect(label.data.createLabel.name).toBe("urgent");
    // Catalog unique.
    const dupLabel = await gql(`mutation{ createLabel(name:"urgent"){ id } }`, undefined, admin);
    expect(dupLabel.errors).toBeDefined();
    // Member cannot create a catalog label.
    const denied = await gql(
      `mutation{ createLabel(name:"x"){ id } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect(denied.errors).toBeDefined();

    const member = await cookieFor(WS_A, "member");
    const labelId = label.data.createLabel.id;
    await gql(
      `mutation($c:String!,$l:String!){ addCaseLabel(caseId:$c, labelId:$l) }`,
      { c: caseId, l: labelId },
      member,
    );
    let c = await gql(
      `query($id:String!){ case(id:$id){ labels{ label{ name } } } }`,
      { id: caseId },
      member,
    );
    expect(c.data.case.labels).toHaveLength(1);
    await gql(
      `mutation($c:String!,$l:String!){ removeCaseLabel(caseId:$c, labelId:$l) }`,
      { c: caseId, l: labelId },
      member,
    );
    c = await gql(`query($id:String!){ case(id:$id){ labels{ id } } }`, { id: caseId }, member);
    expect(c.data.case.labels).toHaveLength(0);
  });
});

describe("documents + hierarchy (Epic #17)", () => {
  it("attaches a document under a slot key (unique) + document_attached event", async () => {
    const caseId = (await makeCase(WS_A)).data.createCase.id;
    const doc = await prisma.document.create({
      data: { title: "Body", content: "text", type: "note" },
    });
    const member = await cookieFor(WS_A, "member");
    const att = await gql(
      `mutation($c:String!,$d:String!){ attachCaseDocument(caseId:$c, documentId:$d, key:"body"){ id key } }`,
      { c: caseId, d: doc.id },
      member,
    );
    expect(att.data.attachCaseDocument.key).toBe("body");
    const kinds = (await prisma.caseEvent.findMany({ where: { caseId } })).map((e) => e.kind);
    expect(kinds).toContain("document_attached");
  });

  it("creating a child case records child_linked on the parent", async () => {
    const parentId = (await makeCase(WS_A, "Parent")).data.createCase.id;
    const member = await cookieFor(WS_A, "member");
    await gql(
      `mutation($p:String!){ createCase(title:"Child", caseType:"bug", parentCaseId:$p){ id } }`,
      { p: parentId },
      member,
    );
    const parentEvents = (await prisma.caseEvent.findMany({ where: { caseId: parentId } })).map(
      (e) => e.kind,
    );
    expect(parentEvents).toContain("child_linked");
  });
});

describe("isolation + gate (Epic #17)", () => {
  it("a workspace cannot see or mutate another's case", async () => {
    const idB = (await makeCase(WS_B)).data.createCase.id;
    const list = await gql(`query{ cases{ id } }`, undefined, await cookieFor(WS_A, "member"));
    expect(list.data.cases).toHaveLength(0);
    const upd = await gql(
      `mutation($id:String!){ setCaseStatus(id:$id, status:"done"){ id } }`,
      { id: idB },
      await cookieFor(WS_A, "member"),
    );
    expect(upd.errors).toBeDefined();
  });

  it("rejects access when CASES is off", async () => {
    try {
      setTestFeature("cases", false);
      invalidateFlagCache();
      const r = await gql(`query{ cases{ id } }`, undefined, await cookieFor(WS_A, "member"));
      expect(r.errors).toBeDefined();
    } finally {
      resetTestFeature("cases");
      invalidateFlagCache();
    }
  });
});
