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

  // Domain 14 #3: wire the hire_agent approval — approving it actually creates the agent.
  it("requestAgentHire proposes a pending hire; approving it creates the agent", async () => {
    const admin = await cookieFor(profileId, WS_A, "admin");
    const proposed = await runGraphQL(
      `mutation{ requestAgentHire(name:"Nova QA", role:"qa", level:"specialist"){ id status subjectType payload } }`,
      undefined,
      admin,
    );
    expect(proposed.errors).toBeFalsy();
    expect(proposed.data.requestAgentHire).toMatchObject({
      status: "pending",
      subjectType: "hire_agent",
    });
    expect(proposed.data.requestAgentHire.payload).toMatchObject({ name: "Nova QA", role: "qa" });
    const approvalId = proposed.data.requestAgentHire.id;

    // No agent exists yet — the hire is only a proposal.
    expect(await prisma.agent.count({ where: { workspaceId: WS_A, name: "Nova QA" } })).toBe(0);

    // Approve → the agent is actually created, and its id is recorded on the payload.
    const approved = await runGraphQL(
      `mutation($id:String!){ approveApproval(id:$id){ status payload } }`,
      { id: approvalId },
      admin,
    );
    expect(approved.data.approveApproval.status).toBe("approved");
    const hiredId = approved.data.approveApproval.payload.hiredAgentId;
    expect(hiredId).toBeTruthy();

    const hired = await prisma.agent.findUniqueOrThrow({ where: { id: hiredId } });
    expect(hired).toMatchObject({
      name: "Nova QA",
      role: "qa",
      workspaceId: WS_A,
      level: "specialist",
      setupStatus: "active",
    });
  });

  it("rejecting a hire_agent approval does NOT create an agent", async () => {
    const admin = await cookieFor(profileId, WS_A, "admin");
    const proposed = await runGraphQL(
      `mutation{ requestAgentHire(name:"Ghost Hire", role:"worker"){ id } }`,
      undefined,
      admin,
    );
    const id = proposed.data.requestAgentHire.id;
    await runGraphQL(`mutation($id:String!){ rejectApproval(id:$id){ status } }`, { id }, admin);
    expect(await prisma.agent.count({ where: { workspaceId: WS_A, name: "Ghost Hire" } })).toBe(0);
  });
});

describe("board quorum (Domain 14 #14)", () => {
  it("a 2-of-N approval finalizes only after two distinct approve votes", async () => {
    const boardA = await prisma.profile.create({ data: { kind: "human", displayName: "Board A" } });
    const boardB = await prisma.profile.create({ data: { kind: "human", displayName: "Board B" } });

    const created = await runGraphQL(
      `mutation{ createApproval(subjectType:"task", subjectId:"t-quorum", title:"needs 2", requiredApprovals:2){ id requiredApprovals } }`,
      undefined,
      await cookieFor(boardA.id, WS_A, "admin"),
    );
    expect(created.data.createApproval.requiredApprovals).toBe(2);
    const id = created.data.createApproval.id;

    const v1 = await runGraphQL(
      `mutation{ castApprovalVote(id:"${id}", vote:"approve"){ status approveVotes } }`,
      undefined,
      await cookieFor(boardA.id, WS_A, "admin"),
    );
    expect(v1.data.castApprovalVote).toMatchObject({ status: "pending", approveVotes: 1 });

    const v2 = await runGraphQL(
      `mutation{ castApprovalVote(id:"${id}", vote:"approve"){ status approveVotes } }`,
      undefined,
      await cookieFor(boardB.id, WS_A, "admin"),
    );
    expect(v2.data.castApprovalVote).toMatchObject({ status: "approved", approveVotes: 2 });
    expect((await prisma.approval.findUniqueOrThrow({ where: { id } })).status).toBe("approved");
  });

  it("a single reject vote finalizes a quorum approval as rejected", async () => {
    const p = await prisma.profile.create({ data: { kind: "human", displayName: "Rejector" } });
    const created = await runGraphQL(
      `mutation{ createApproval(subjectType:"task", subjectId:"t-rej", title:"rej", requiredApprovals:3){ id } }`,
      undefined,
      await cookieFor(p.id, WS_A, "admin"),
    );
    const id = created.data.createApproval.id;
    const rej = await runGraphQL(
      `mutation{ castApprovalVote(id:"${id}", vote:"reject"){ status } }`,
      undefined,
      await cookieFor(p.id, WS_A, "admin"),
    );
    expect(rej.data.castApprovalVote.status).toBe("rejected");
  });
});
