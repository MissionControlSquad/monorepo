import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";

/**
 * Epic #7 routines + pipelines — real GraphQL route + Postgres, human auth via bb-workspace-token.
 * `userId` in the token is a real Profile id (bootstrap invariant) so profile FKs resolve.
 */
const SECRET = "pipe-test-secret";
const WS_A = "ws_pipe_A";
const WS_B = "ws_pipe_B";
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

async function pipelineWithStages(ws: string, reviewAtOrder1 = false) {
  const admin = await cookieFor(ws, "admin");
  const p = await gql(`mutation($n:String!){ createPipeline(name:$n){ id } }`, { n: "P" }, admin);
  const pid = p.data.createPipeline.id;
  const stageIds: string[] = [];
  for (const [i, review] of [
    [0, false],
    [1, reviewAtOrder1],
    [2, false],
  ] as [number, boolean][]) {
    const s = await gql(
      `mutation($p:String!,$n:String!,$o:Int!,$r:Boolean){ addPipelineStage(pipelineId:$p, name:$n, order:$o, isReviewStage:$r){ id order } }`,
      { p: pid, n: `S${i}`, o: i, r: review },
      admin,
    );
    stageIds.push(s.data.addPipelineStage.id);
  }
  return { pid, stageIds };
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE routines, pipelines, tasks, profiles CASCADE`);
  // Recreate the human whose id backs the token's userId (profile FKs on routines/cases).
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Pipe Human" } });
  humanId = p.id;
});

describe("routines (Epic #7)", () => {
  it("triggerRoutineNow runs to succeeded and generates a Task", async () => {
    const admin = await cookieFor(WS_A, "admin");
    const r = await gql(
      `mutation($d:JSON!){ createRoutine(name:"Daily report", definition:$d){ id currentVersion } }`,
      { d: { steps: ["a"] } },
      admin,
    );
    expect(r.errors).toBeFalsy();
    const id = r.data.createRoutine.id;
    const run = await gql(
      `mutation($id:String!){ triggerRoutineNow(routineId:$id){ id status generatedTaskId } }`,
      { id },
      await cookieFor(WS_A, "member"),
    );
    expect(run.data.triggerRoutineNow.status).toBe("succeeded");
    expect(run.data.triggerRoutineNow.generatedTaskId).toBeTruthy();
    const task = await prisma.task.findUnique({
      where: { id: run.data.triggerRoutineNow.generatedTaskId },
    });
    expect(task?.title).toBe("Daily report");
  });

  it("applies assignee / priority / goal metadata to the generated task", async () => {
    const admin = await cookieFor(WS_A, "admin");
    const agent = await prisma.agent.create({
      data: { name: "Reporter", role: "worker", workspaceId: WS_A },
    });
    const goal = await prisma.goal.create({ data: { workspaceId: WS_A, title: "Weekly OKR" } });

    const r = await gql(
      `mutation($d:JSON!,$a:String!,$g:String!){ createRoutine(name:"Report", definition:$d, assigneeAgentId:$a, priority:"high", goalId:$g){ id assigneeAgentId priority goalId } }`,
      { d: { steps: ["a"] }, a: agent.id, g: goal.id },
      admin,
    );
    expect(r.errors).toBeFalsy();
    expect(r.data.createRoutine).toMatchObject({
      assigneeAgentId: agent.id,
      priority: "high",
      goalId: goal.id,
    });

    const run = await gql(
      `mutation($id:String!){ triggerRoutineNow(routineId:$id){ generatedTaskId } }`,
      { id: r.data.createRoutine.id },
      admin,
    );
    const taskId = run.data.triggerRoutineNow.generatedTaskId;
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { assignees: true },
    });
    expect(task?.priority).toBe("high");
    expect(task?.goalId).toBe(goal.id);
    // the task is assigned to the agent's profile
    const agentProfile = await prisma.profile.findFirst({ where: { agentId: agent.id } });
    expect(task?.assignees.map((a) => a.profileId)).toContain(agentProfile?.id);
  });

  it("updateRoutine snapshots a new revision only when the definition changes", async () => {
    const admin = await cookieFor(WS_A, "admin");
    const id = (
      await gql(
        `mutation($d:JSON!){ createRoutine(name:"R", definition:$d){ id } }`,
        { d: { v: 1 } },
        admin,
      )
    ).data.createRoutine.id;

    // No-definition update → still v1, one revision.
    await gql(
      `mutation($id:String!){ updateRoutine(id:$id, description:"desc"){ currentVersion } }`,
      { id },
      admin,
    );
    expect(await prisma.routineRevision.count({ where: { routineId: id } })).toBe(1);

    // Definition change → v2, two revisions.
    const up = await gql(
      `mutation($id:String!,$d:JSON!){ updateRoutine(id:$id, definition:$d){ currentVersion } }`,
      { id, d: { v: 2 } },
      admin,
    );
    expect(up.data.updateRoutine.currentVersion).toBe(2);
    expect(await prisma.routineRevision.count({ where: { routineId: id } })).toBe(2);
  });
});

describe("pipeline cases (Epic #7)", () => {
  it("createCase places the case at the first stage; transition only moves forward", async () => {
    const { pid, stageIds } = await pipelineWithStages(WS_A);
    const member = await cookieFor(WS_A, "member");
    const c = await gql(
      `mutation($p:String!){ createPipelineCase(pipelineId:$p, title:"Case 1"){ id currentStageId status } }`,
      { p: pid },
      member,
    );
    const caseId = c.data.createPipelineCase.id;
    expect(c.data.createPipelineCase.currentStageId).toBe(stageIds[0]);

    // Backward/equal transition rejected.
    const back = await gql(
      `mutation($c:String!,$s:String!){ transitionCase(caseId:$c, toStageId:$s){ id } }`,
      { c: caseId, s: stageIds[0] },
      member,
    );
    expect(back.errors).toBeDefined();

    // Forward transition to stage 2 accepted.
    const fwd = await gql(
      `mutation($c:String!,$s:String!){ transitionCase(caseId:$c, toStageId:$s){ currentStageId } }`,
      { c: caseId, s: stageIds[2] },
      member,
    );
    expect(fwd.data.transitionCase.currentStageId).toBe(stageIds[2]);

    // Events: created + transitioned recorded.
    const events = await prisma.pipelineCaseEvent.findMany({ where: { caseId } });
    expect(events.map((e) => e.type).sort()).toEqual(["created", "transitioned"]);
  });

  it("claimCase is atomic — concurrent claims yield exactly one winner", async () => {
    const { pid } = await pipelineWithStages(WS_A);
    const member = await cookieFor(WS_A, "member");
    const caseId = (
      await gql(
        `mutation($p:String!){ createPipelineCase(pipelineId:$p, title:"race"){ id } }`,
        { p: pid },
        member,
      )
    ).data.createPipelineCase.id;

    const CLAIM = `mutation($c:String!){ claimCase(caseId:$c){ id status } }`;
    const [a, b] = await Promise.all([
      gql(CLAIM, { c: caseId }, member),
      gql(CLAIM, { c: caseId }, member),
    ]);
    const wins = [a, b].filter((r) => !r.errors && r.data?.claimCase?.status === "claimed").length;
    expect(wins).toBe(1);
  });

  it("breakdownCase creates a linked Task", async () => {
    const { pid } = await pipelineWithStages(WS_A);
    const member = await cookieFor(WS_A, "member");
    const caseId = (
      await gql(
        `mutation($p:String!){ createPipelineCase(pipelineId:$p, title:"bd"){ id } }`,
        { p: pid },
        member,
      )
    ).data.createPipelineCase.id;
    const bd = await gql(
      `mutation($c:String!){ breakdownCase(caseId:$c, title:"Sub", description:"do it"){ id linkedTaskId } }`,
      { c: caseId },
      member,
    );
    expect(bd.data.breakdownCase.linkedTaskId).toBeTruthy();
    expect(await prisma.task.count({ where: { id: bd.data.breakdownCase.linkedTaskId } })).toBe(1);
  });
});

describe("case release + claim lease (Epic #7)", () => {
  async function makeClaimedCase() {
    const { pid } = await pipelineWithStages(WS_A);
    const member = await cookieFor(WS_A, "member");
    const caseId = (
      await gql(
        `mutation($p:String!){ createPipelineCase(pipelineId:$p, title:"lease"){ id } }`,
        { p: pid },
        member,
      )
    ).data.createPipelineCase.id;
    await gql(`mutation($c:String!){ claimCase(caseId:$c){ id status } }`, { c: caseId }, member);
    return { pid, caseId, member };
  }

  it("releaseCase returns a claimed case to open, clearing the claimer", async () => {
    const { caseId, member } = await makeClaimedCase();
    const r = await gql(
      `mutation($c:String!){ releaseCase(caseId:$c){ id status } }`,
      { c: caseId },
      member,
    );
    expect(r.errors).toBeFalsy();
    expect(r.data.releaseCase.status).toBe("open");
    const row = await prisma.pipelineCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(row.claimedByProfileId).toBeNull();
    expect(row.claimedAt).toBeNull();
    // a `released` event was appended.
    expect(await prisma.pipelineCaseEvent.count({ where: { caseId, type: "released" } })).toBe(1);
  });

  it("releasing an unclaimed (open) case is rejected", async () => {
    const { pid } = await pipelineWithStages(WS_A);
    const member = await cookieFor(WS_A, "member");
    const caseId = (
      await gql(
        `mutation($p:String!){ createPipelineCase(pipelineId:$p, title:"open"){ id } }`,
        { p: pid },
        member,
      )
    ).data.createPipelineCase.id;
    const r = await gql(
      `mutation($c:String!){ releaseCase(caseId:$c){ id } }`,
      { c: caseId },
      member,
    );
    expect(r.errors).toBeDefined();
  });

  it("staleClaims surfaces a case claimed longer than the lease window", async () => {
    const { caseId, member } = await makeClaimedCase();
    // Backdate the claim to 2h ago so a 60-minute lease has expired.
    await prisma.pipelineCase.update({
      where: { id: caseId },
      data: { claimedAt: new Date(Date.now() - 120 * 60000) },
    });
    const stale = await gql(
      `query{ staleClaims(leaseMinutes:60){ caseId title minutesClaimed leaseMinutes } }`,
      undefined,
      member,
    );
    expect(stale.errors).toBeFalsy();
    expect(stale.data.staleClaims).toHaveLength(1);
    expect(stale.data.staleClaims[0].caseId).toBe(caseId);
    expect(stale.data.staleClaims[0].minutesClaimed).toBeGreaterThanOrEqual(60);

    // A fresh claim is NOT stale under the same lease.
    const fresh = await gql(
      `query{ staleClaims(leaseMinutes:10000){ caseId } }`,
      undefined,
      member,
    );
    expect(fresh.data.staleClaims).toHaveLength(0);
  });
});

describe("case comments + timeline (Epic #7)", () => {
  it("commentCase appends a commented event; caseEvents returns the timeline oldest-first", async () => {
    const { pid } = await pipelineWithStages(WS_A);
    const member = await cookieFor(WS_A, "member");
    const caseId = (
      await gql(
        `mutation($p:String!){ createPipelineCase(pipelineId:$p, title:"c"){ id } }`,
        { p: pid },
        member,
      )
    ).data.createPipelineCase.id;

    const empty = await gql(
      `mutation($c:String!){ commentCase(caseId:$c, note:"   "){ id } }`,
      { c: caseId },
      member,
    );
    expect(empty.errors).toBeDefined(); // blank comment rejected

    const ok = await gql(
      `mutation($c:String!){ commentCase(caseId:$c, note:"looks good"){ id } }`,
      { c: caseId },
      member,
    );
    expect(ok.errors).toBeFalsy();

    const events = await gql(
      `query($c:String!){ pipelineCaseEvents(caseId:$c){ type note } }`,
      { c: caseId },
      member,
    );
    // created (from case creation) then commented.
    expect(events.data.pipelineCaseEvents.map((e: { type: string }) => e.type)).toEqual([
      "created",
      "commented",
    ]);
    const comment = events.data.pipelineCaseEvents.find(
      (e: { type: string }) => e.type === "commented",
    );
    expect(comment.note).toBe("looks good");

    // cross-workspace cannot read this case's timeline.
    const cross = await gql(
      `query($c:String!){ pipelineCaseEvents(caseId:$c){ type } }`,
      { c: caseId },
      await cookieFor(WS_B, "member"),
    );
    expect(cross.data.pipelineCaseEvents).toHaveLength(0);
  });
});

describe("review inbox + health (Epic #7)", () => {
  it("reviewCases returns only cases on a review stage", async () => {
    const { pid, stageIds } = await pipelineWithStages(WS_A, /* reviewAtOrder1 */ true);
    const member = await cookieFor(WS_A, "member");
    const caseId = (
      await gql(
        `mutation($p:String!){ createPipelineCase(pipelineId:$p, title:"rev"){ id } }`,
        { p: pid },
        member,
      )
    ).data.createPipelineCase.id;

    // Not on review stage yet → empty inbox.
    let inbox = await gql(
      `query($p:String){ reviewCases(pipelineId:$p){ id } }`,
      { p: pid },
      member,
    );
    expect(inbox.data.reviewCases).toHaveLength(0);

    // Move to the review stage → appears.
    await gql(
      `mutation($c:String!,$s:String!){ transitionCase(caseId:$c, toStageId:$s){ status } }`,
      { c: caseId, s: stageIds[1] },
      member,
    );
    inbox = await gql(`query($p:String){ reviewCases(pipelineId:$p){ id } }`, { p: pid }, member);
    expect(inbox.data.reviewCases.map((c: any) => c.id)).toEqual([caseId]);
  });

  it("pipelineHealth flags a case past its stage SLA", async () => {
    const admin = await cookieFor(WS_A, "admin");
    const pid = (await gql(`mutation{ createPipeline(name:"H"){ id } }`, undefined, admin)).data
      .createPipeline.id;
    await gql(
      `mutation($p:String!){ addPipelineStage(pipelineId:$p, name:"S0", order:0, slaMinutes:1){ id } }`,
      { p: pid },
      admin,
    );
    const member = await cookieFor(WS_A, "member");
    const caseId = (
      await gql(
        `mutation($p:String!){ createPipelineCase(pipelineId:$p, title:"stale"){ id } }`,
        { p: pid },
        member,
      )
    ).data.createPipelineCase.id;
    // Backdate entry 2 hours to exceed the 1-minute SLA.
    await prisma.pipelineCase.update({
      where: { id: caseId },
      data: { enteredStageAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
    });

    const health = await gql(
      `query($p:String!){ pipelineHealth(pipelineId:$p){ caseId minutesInStage slaMinutes } }`,
      { p: pid },
      member,
    );
    expect(health.data.pipelineHealth).toHaveLength(1);
    expect(health.data.pipelineHealth[0].caseId).toBe(caseId);
    expect(health.data.pipelineHealth[0].minutesInStage).toBeGreaterThan(1);
  });
});

describe("isolation + gate (Epic #7)", () => {
  it("a workspace cannot see another's routines", async () => {
    await gql(
      `mutation($d:JSON!){ createRoutine(name:"B routine", definition:$d){ id } }`,
      { d: {} },
      await cookieFor(WS_B, "admin"),
    );
    const list = await gql(
      `query{ routines{ id workspaceId } }`,
      undefined,
      await cookieFor(WS_A, "member"),
    );
    expect(list.data.routines).toHaveLength(0);
  });

  it("rejects access when the feature is off", async () => {
    try {
      await prisma.featureFlag.upsert({
        where: { key: "pipelines_routines" },
        create: { key: "pipelines_routines", enabled: false, managedBy: "user" },
        update: { enabled: false },
      });
      invalidateFlagCache();
      const r = await gql(`query{ routines{ id } }`, undefined, await cookieFor(WS_A, "member"));
      expect(r.errors).toBeDefined();
    } finally {
      await prisma.featureFlag.deleteMany({ where: { key: "pipelines_routines" } });
      invalidateFlagCache();
    }
  });
});

describe("stage approval gate (Epic #7)", () => {
  it("a member cannot advance a case out of a requireApproval stage; an admin can", async () => {
    const admin = await cookieFor(WS_A, "admin");
    const p = await gql(`mutation{ createPipeline(name:"Gated"){ id } }`, undefined, admin);
    const pid = p.data.createPipeline.id;
    const stageIds: string[] = [];
    for (const [order, gated] of [
      [0, false],
      [1, true], // approval gate
      [2, false],
    ] as [number, boolean][]) {
      const s = await gql(
        `mutation($p:String!,$n:String!,$o:Int!,$g:Boolean){ addPipelineStage(pipelineId:$p, name:$n, order:$o, requireApproval:$g){ id requireApproval } }`,
        { p: pid, n: `S${order}`, o: order, g: gated },
        admin,
      );
      stageIds.push(s.data.addPipelineStage.id);
    }

    const c = await gql(
      `mutation($p:String!){ createPipelineCase(pipelineId:$p, title:"c"){ id } }`,
      { p: pid },
      admin,
    );
    const caseId = c.data.createPipelineCase.id;
    // move into the gated stage (order 1) — allowed for anyone
    await gql(
      `mutation($c:String!,$s:String!){ transitionCase(caseId:$c, toStageId:$s){ id } }`,
      { c: caseId, s: stageIds[1] },
      await cookieFor(WS_A, "member"),
    );

    // leaving the gated stage: member is blocked, admin is allowed
    const denied = await gql(
      `mutation($c:String!,$s:String!){ transitionCase(caseId:$c, toStageId:$s){ id } }`,
      { c: caseId, s: stageIds[2] },
      await cookieFor(WS_A, "member"),
    );
    expect(denied.errors).toBeDefined();

    const ok = await gql(
      `mutation($c:String!,$s:String!){ transitionCase(caseId:$c, toStageId:$s){ currentStageId } }`,
      { c: caseId, s: stageIds[2] },
      admin,
    );
    expect(ok.errors).toBeFalsy();
    expect(ok.data.transitionCase.currentStageId).toBe(stageIds[2]);
  });
});
