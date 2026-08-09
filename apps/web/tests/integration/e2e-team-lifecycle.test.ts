import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { createTestAgent } from "../helpers";

// FULL engineering-team lifecycle, driven through the REAL /api/graphql route:
//   leader + worker agents → worker reports to leader → company/project assignment →
//   credentials bound to the worker → knowledge base (AGENTS.md) the worker reads →
//   task assigned → worker executes (assigned→in_progress→review) → worker submits a
//   deliverable → leader verifies it (vote + annotation) → physical-user approval →
//   task marked done. Every step is UI-op → route → resolver → service → Postgres.
const SECRET = "e2e-team-secret";
const WS = "ws_e2e_team";
let humanId = "";

async function gql(q: string, v?: Record<string, unknown>, role: "admin" | "member" = "admin") {
  const token = await createJWT({ userId: humanId, workspaceId: WS, userRole: role, email: "lead@x.com" }, SECRET);
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
    body: JSON.stringify({ query: q, variables: v }),
  });
  return JSON.parse(await (await POST(req)).text()) as { data?: any; errors?: any };
}
const ok = (r: { errors?: any }, label: string) => expect(r.errors, `${label}: ${JSON.stringify(r.errors)}`).toBeUndefined();

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
  humanId = "human-e2e-team";
});

beforeEach(async () => {
  const wsProjects = await prisma.project.findMany({ where: { workspaceId: WS }, select: { id: true } });
  const projIds = wsProjects.map((p) => p.id);
  await prisma.deliverable.deleteMany({ where: { task: { projectId: { in: projIds } } } }).catch(() => {});
  await prisma.task.deleteMany({ where: { projectId: { in: projIds } } });
  await prisma.approval.deleteMany({ where: { requestedById: humanId } }).catch(() => {});
  await prisma.agent.deleteMany({ where: { workspaceId: WS } });
  await prisma.project.deleteMany({ where: { workspaceId: WS } });
  await prisma.agentCompany.deleteMany({ where: { workspaceId: WS } });
  // the human reviewer/approver needs a Profile row (Approval.requestedById FKs to Profile)
  await prisma.profile.upsert({
    where: { id: humanId },
    create: { id: humanId, kind: "human", displayName: "Team Lead (human)" },
    update: {},
  });
  for (const key of Object.values(FLAG_KEYS)) {
    await prisma.featureFlag.upsert({ where: { key }, create: { key, enabled: true, managedBy: "user" }, update: { enabled: true } });
  }
  invalidateFlagCache();
});

describe("E2E: engineering-team lifecycle (leader → worker → task → deliverable → verification → done)", () => {
  it("runs the whole lifecycle through the real API", async () => {
    // ── team + org structure ────────────────────────────────────────────────
    const co = await gql(`mutation{ createAgentCompany(name:"DeepBuild Labs"){ id } }`);
    ok(co, "createAgentCompany");
    const companyId = co.data.createAgentCompany.id;

    const pr = await gql(`mutation{ createProject(name:"Payments Rewrite"){ id } }`);
    ok(pr, "createProject");
    const projectId = pr.data.createProject.id;

    const { agent: leader } = await createTestAgent({ name: "Ada (Lead)", role: "Tech Lead", status: "active" });
    const { agent: worker } = await createTestAgent({ name: "Linus (Eng)", role: "Engineer", status: "active" });
    await prisma.agent.updateMany({ where: { id: { in: [leader.id, worker.id] } }, data: { workspaceId: WS } });

    // worker reports to the leader
    const reports = await gql(
      `mutation($a:String!,$m:String!){ setAgentReportsTo(agentId:$a, reportsToAgentId:$m){ id } }`,
      { a: worker.id, m: leader.id },
    );
    ok(reports, "setAgentReportsTo");

    // both agents join the company + project
    for (const id of [leader.id, worker.id]) {
      ok(await gql(`mutation($a:String!,$c:String!){ setAgentCompany(agentId:$a, companyId:$c){ id } }`, { a: id, c: companyId }), "setAgentCompany");
      ok(await gql(`mutation($p:String!,$a:String!){ addProjectMember(projectId:$p, agentId:$a){ id } }`, { p: projectId, a: id }), "addProjectMember");
    }

    // ── credentials the worker will use during the task ─────────────────────
    const secret = await gql(
      `mutation{ createSecret(name:"DEPLOY_TOKEN", value:"tok_live_abc123", description:"prod deploy"){ id name } }`,
    );
    ok(secret, "createSecret");
    const secretId = secret.data.createSecret.id;
    const bind = await gql(
      `mutation($s:String!,$a:String!){ bindSecret(secretId:$s, scope:"agent", envVarName:"DEPLOY_TOKEN", agentId:$a){ id envVarName } }`,
      { s: secretId, a: worker.id },
    );
    ok(bind, "bindSecret");
    expect(bind.data.bindSecret.envVarName).toBe("DEPLOY_TOKEN");

    // ── knowledge base: the AGENTS.md the worker reads before working ───────
    const know = await gql(
      `mutation($a:String!){ upsertAgentInstruction(agentId:$a, fileName:"AGENTS.md", content:"# Runbook\\nDeploy with $DEPLOY_TOKEN to staging first."){ id fileName } }`,
      { a: worker.id },
    );
    ok(know, "upsertAgentInstruction");

    // ── task assigned to the worker ─────────────────────────────────────────
    const task = await gql(
      `mutation($a:String!,$p:String!){ createTask(title:"Ship idempotent refunds", description:"add refund idempotency keys", assigneeIds:[$a], projectId:$p){ id status } }`,
      { a: worker.id, p: projectId },
    );
    ok(task, "createTask");
    const taskId = task.data.createTask.id;

    // ── worker EXECUTES: reads knowledge, uses the bound credential, works ───
    const kb = await gql(`query($a:String!){ agentInstructions(agentId:$a){ fileName content } }`, { a: worker.id }, "member");
    ok(kb, "agentInstructions(read knowledge)");
    expect(kb.data.agentInstructions.some((f: any) => f.fileName === "AGENTS.md")).toBe(true);

    ok(await gql(`mutation($id:String!){ updateTask(id:$id, status:"in_progress"){ id status } }`, { id: taskId }), "start work");
    ok(await gql(`mutation($id:String!){ updateTask(id:$id, status:"review"){ id status } }`, { id: taskId }), "submit for review");

    // ── worker submits the result as a deliverable ──────────────────────────
    const deliv = await gql(
      `mutation($t:String!,$a:String!){ submitDeliverable(taskId:$t, agentId:$a, title:"PR: refund idempotency", kind:"code", content:"diff --git a/refunds.ts ...", language:"typescript"){ id title } }`,
      { t: taskId, a: worker.id },
    );
    ok(deliv, "submitDeliverable");
    const deliverableId = deliv.data.submitDeliverable.id;

    // ── leader verifies the deliverable (vote up + annotation) ──────────────
    const vote = await gql(`mutation($d:String!){ castDeliverableVote(deliverableId:$d, value:1){ score upCount } }`, { d: deliverableId });
    ok(vote, "leader vote");
    expect(vote.data.castDeliverableVote.upCount).toBeGreaterThan(0);
    ok(await gql(`mutation($d:String!){ addDeliverableAnnotation(deliverableId:$d, body:"LGTM — matches the runbook, ship it."){ id } }`, { d: deliverableId }), "leader annotation");

    // ── physical-user approval gate before marking done ─────────────────────
    const appr = await gql(
      `mutation($t:String!){ createApproval(subjectType:"task", subjectId:$t, taskId:$t, title:"Approve refunds deploy"){ id status } }`,
      { t: taskId },
    );
    ok(appr, "createApproval");
    const approvalId = appr.data.createApproval.id;
    const decide = await gql(`mutation($id:String!){ approveApproval(id:$id, decisionNote:"Approved by human"){ id status } }`, { id: approvalId });
    ok(decide, "approveApproval");

    // ── task marked done ────────────────────────────────────────────────────
    ok(await gql(`mutation($id:String!){ updateTask(id:$id, status:"done"){ id status } }`, { id: taskId }), "mark done");

    // ── verify the whole chain persisted, cross-module ──────────────────────
    const [pWorker, pTask, pDeliv, pApproval] = await Promise.all([
      prisma.agent.findUnique({ where: { id: worker.id } }),
      prisma.task.findUnique({ where: { id: taskId } }),
      prisma.deliverable.findUnique({ where: { id: deliverableId } }),
      prisma.approval.findUnique({ where: { id: approvalId } }),
    ]);
    expect(pWorker?.companyId).toBe(companyId);        // worker ↔ company
    expect(pTask?.status).toBe("done");                // task reached terminal state
    expect(pTask?.projectId).toBe(projectId);          // task ↔ project
    expect(pDeliv?.taskId).toBe(taskId);               // deliverable ↔ task
    expect(pApproval?.status).toBe("approved");        // human approval recorded
  });
});
