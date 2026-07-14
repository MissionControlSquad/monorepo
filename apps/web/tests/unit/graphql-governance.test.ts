import { describe, it, expect, beforeAll } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";

/**
 * Integration test for Epic #3 governance (Approvals) — exercises the real GraphQL route
 * (schema build + resolvers + DB + workspace isolation). Auth is simulated via a signed
 * bb-workspace-token cookie that resolveTenancy verifies (Epic #1).
 */
const SECRET = "gov-test-secret";
const WS_A = "ws_gov_A";
const WS_B = "ws_gov_B";

async function runGraphQL(query: string, variables?: Record<string, unknown>, cookie?: string) {
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

async function cookieFor(userId: string, workspaceId: string, role: "admin" | "member") {
  const token = await createJWT({ userId, workspaceId, userRole: role }, SECRET);
  return `bb-workspace-token=${token}`;
}

describe("GraphQL governance / approvals (Epic #3)", () => {
  let profileId: string;

  beforeAll(async () => {
    process.env.SYSTEM_SECRET = SECRET;
    const profile = await prisma.profile.create({
      data: { kind: "human", displayName: "Governance Tester" },
    });
    profileId = profile.id;
  });

  async function createApprovalIn(ws: string, title = "Hire agent X") {
    const cookie = await cookieFor(profileId, ws, "admin");
    const r = await runGraphQL(
      `mutation($t:String!){ createApproval(subjectType:"hire_agent", subjectId:"spec-1", title:$t){ id status subjectType workspaceId } }`,
      { t: title },
      cookie,
    );
    return r;
  }

  it("creates an approval scoped to the caller's workspace", async () => {
    const r = await createApprovalIn(WS_A);
    expect(r.errors).toBeFalsy();
    expect(r.data.createApproval.status).toBe("pending");
    expect(r.data.createApproval.subjectType).toBe("hire_agent");
    expect(r.data.createApproval.workspaceId).toBe(WS_A);
  });

  it("member cannot approve; admin can", async () => {
    const created = await createApprovalIn(WS_A);
    const id = created.data.createApproval.id;

    const memberCookie = await cookieFor(profileId, WS_A, "member");
    const denied = await runGraphQL(
      `mutation($id:String!){ approveApproval(id:$id){ id status } }`,
      { id },
      memberCookie,
    );
    // requireRole(admin) throws — Yoga masks the message, so assert an error occurred + no data.
    expect(denied.errors).toBeDefined();
    expect(denied.errors!.length).toBeGreaterThan(0);
    expect(denied.data?.approveApproval).toBeFalsy();

    const adminCookie = await cookieFor(profileId, WS_A, "admin");
    const ok = await runGraphQL(
      `mutation($id:String!){ approveApproval(id:$id){ id status } }`,
      { id },
      adminCookie,
    );
    expect(ok.errors).toBeFalsy();
    expect(ok.data.approveApproval.status).toBe("approved");
  });

  it("cross-workspace isolation: workspace B cannot see or read workspace A's approval", async () => {
    const created = await createApprovalIn(WS_A, "Isolation subject");
    const idA = created.data.createApproval.id;

    const bCookie = await cookieFor(profileId, WS_B, "admin");
    const list = await runGraphQL(`query{ approvals{ id workspaceId } }`, undefined, bCookie);
    expect(list.errors).toBeFalsy();
    const ids = (list.data.approvals as { id: string }[]).map((a) => a.id);
    expect(ids).not.toContain(idA);

    const single = await runGraphQL(
      `query($id:String!){ approval(id:$id){ id } }`,
      { id: idA },
      bCookie,
    );
    expect(single.data.approval).toBeNull();
  });

  it("unauthenticated request is denied", async () => {
    const r = await runGraphQL(`query{ approvals{ id } }`);
    expect(r.errors).toBeDefined();
    expect(r.errors!.length).toBeGreaterThan(0);
    expect(r.data?.approvals).toBeFalsy();
  });

  it("requestApprovalChanges: admin sends a pending approval to needs_changes with a note", async () => {
    const created = await createApprovalIn(WS_A, "Needs work");
    const id = created.data.createApproval.id;
    const adminCookie = await cookieFor(profileId, WS_A, "admin");

    const changed = await runGraphQL(
      `mutation($id:String!,$n:String){ requestApprovalChanges(id:$id, decisionNote:$n){ id status decisionNote } }`,
      { id, n: "Tighten the scope" },
      adminCookie,
    );
    expect(changed.errors).toBeFalsy();
    expect(changed.data.requestApprovalChanges.status).toBe("needs_changes");
    expect(changed.data.requestApprovalChanges.decisionNote).toBe("Tighten the scope");

    // Non-terminal: the requester can resubmit it back to pending.
    const resubmitted = await runGraphQL(
      `mutation($id:String!){ resubmitApproval(id:$id){ id status resubmitCount } }`,
      { id },
      await cookieFor(profileId, WS_A, "member"),
    );
    expect(resubmitted.data.resubmitApproval.status).toBe("pending");
    expect(resubmitted.data.resubmitApproval.resubmitCount).toBe(1);
  });

  it("requestApprovalChanges: member cannot; only a pending approval can be sent back", async () => {
    const created = await createApprovalIn(WS_A, "Guarded");
    const id = created.data.createApproval.id;

    const denied = await runGraphQL(
      `mutation($id:String!){ requestApprovalChanges(id:$id){ id status } }`,
      { id },
      await cookieFor(profileId, WS_A, "member"),
    );
    expect(denied.errors).toBeDefined();
    expect(denied.data?.requestApprovalChanges).toBeFalsy();

    // Approve it (terminal), then a change-request must be rejected.
    const adminCookie = await cookieFor(profileId, WS_A, "admin");
    await runGraphQL(`mutation($id:String!){ approveApproval(id:$id){ id } }`, { id }, adminCookie);
    const afterApprove = await runGraphQL(
      `mutation($id:String!){ requestApprovalChanges(id:$id){ id status } }`,
      { id },
      adminCookie,
    );
    expect(afterApprove.errors).toBeDefined();
  });
});
