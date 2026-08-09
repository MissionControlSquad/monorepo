import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { createRoutine, addRoutineTrigger } from "../../src/server/services/routines";

/**
 * Detail routes (pipeline / routine / execution-workspace) read through the existing resolvers plus
 * the newly-exposed cron schedule fields on RoutineTrigger. Real GraphQL route + Postgres, human
 * auth via bb-workspace-token (userId is a real Profile id).
 */
const SECRET = "work-detail-secret";
const WS_A = "ws_wd_A";
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

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE routines, pipelines, tasks, profiles CASCADE`);
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "WD Human" } });
  humanId = p.id;
});

describe("routine detail read", () => {
  it("returns the routine with its triggers' cron schedule (cronExpression + timezone)", async () => {
    const routine = await createRoutine({
      workspaceId: WS_A,
      name: "Nightly",
      definition: { v: 1 },
    });
    await addRoutineTrigger(
      WS_A,
      routine.id,
      { type: "cron", cronExpression: "0 9 * * *", timezone: "America/New_York" },
      new Date("2026-07-19T08:30:00Z"),
    );

    const res = await gql(
      `query($id:String!){ routine(id:$id){ id name currentVersion triggers { type cronExpression timezone nextFireAt } } }`,
      { id: routine.id },
      await cookieFor(WS_A, "member"),
    );
    expect(res.errors).toBeFalsy();
    expect(res.data.routine.name).toBe("Nightly");
    const trig = res.data.routine.triggers[0];
    expect(trig).toMatchObject({
      type: "cron",
      cronExpression: "0 9 * * *",
      timezone: "America/New_York",
    });
    expect(trig.nextFireAt).toBeTruthy();
  });

  it("does not leak a routine from another workspace", async () => {
    const routine = await createRoutine({ workspaceId: "ws_wd_B", name: "Other", definition: {} });
    const res = await gql(
      `query($id:String!){ routine(id:$id){ id } }`,
      { id: routine.id },
      await cookieFor(WS_A, "member"),
    );
    expect(res.errors).toBeFalsy();
    expect(res.data.routine).toBeNull();
  });
});

describe("pipeline detail read", () => {
  it("returns a single pipeline with ordered stages and aggregate stats", async () => {
    const admin = await cookieFor(WS_A, "admin");
    const pid = (await gql(`mutation{ createPipeline(name:"P"){ id } }`, {}, admin)).data
      .createPipeline.id;
    for (const [n, o] of [
      ["Intake", 0],
      ["Review", 1],
    ] as [string, number][]) {
      await gql(
        `mutation($p:String!,$n:String!,$o:Int!){ addPipelineStage(pipelineId:$p, name:$n, order:$o){ id } }`,
        { p: pid, n, o },
        admin,
      );
    }

    const res = await gql(
      `query($id:String!,$p:String!){
         pipeline(id:$id){ id name stages { name order } }
         pipelineStats(pipelineId:$p){ activeCount doneCount rejectedCount }
       }`,
      { id: pid, p: pid },
      await cookieFor(WS_A, "member"),
    );
    expect(res.errors).toBeFalsy();
    expect(res.data.pipeline.stages.map((s: { order: number }) => s.order)).toEqual([0, 1]);
    expect(res.data.pipelineStats).toMatchObject({
      activeCount: 0,
      doneCount: 0,
      rejectedCount: 0,
    });
  });
});
