import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache, resetTestFeature } from "../../src/server/feature-flags";
import {
  mintRunBridgeToken,
  verifyRunBridgeToken,
  bridgePostMessage,
} from "../../src/server/services/run-bridge";

/**
 * docs/RBAC.md §D — viewer is truly read-only. The highest-traffic HUMAN "operate" mutations
 * (create task, post message, submit deliverable, …) now carry a `requireRole(ctx, "member")`
 * gate at the GraphQL RESOLVER layer.
 *
 * The gate must:
 *   - DENY viewer (rank 0) with FORBIDDEN,
 *   - ADMIT member / admin / owner,
 *   - ADMIT API-key agents (they resolve as role `member`, resolve.ts `fromApiKey`),
 *   - NOT affect the run-bridge path (agents in a sandbox post via the run-scoped token straight
 *     into the service `bridgePostMessage`, which never touches this resolver or `requireRole`).
 */
const SECRET = "viewer-readonly-secret";
const WS = "ws_viewer_readonly";

type GqlResult = {
  data?: any;
  errors?: { message: string; extensions?: { code?: string } }[];
};

async function gql(
  query: string,
  variables: Record<string, unknown>,
  opts: { role?: "owner" | "admin" | "member" | "viewer"; bearer?: string } = {},
): Promise<GqlResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.bearer) {
    headers.Authorization = `Bearer ${opts.bearer}`;
  } else {
    const token = await createJWT(
      { userId: `u_${opts.role}`, workspaceId: WS, userRole: opts.role },
      SECRET,
    );
    headers.Cookie = `bb-workspace-token=${token}`;
  }
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const text = await (await GRAPHQL(req)).text();
  return text ? (JSON.parse(text) as GqlResult) : { errors: [{ message: "empty" }] };
}

// The three canonical operate mutations that the required test matrix must prove.
const CREATE_TASK = `mutation($t:String!,$d:String!){ createTask(title:$t, description:$d, assigneeIds:[]){ id } }`;
const POST_MESSAGE = `mutation($task:String!,$from:String!,$c:String!){ createMessage(taskId:$task, fromProfileId:$from, content:$c){ id } }`;
const SUBMIT_DELIVERABLE = `mutation($task:String!,$agent:String!,$title:String!,$kind:String!){ submitDeliverable(taskId:$task, agentId:$agent, title:$title, kind:$kind){ id } }`;

let humanProfileId = "";
let agentId = "";
let taskId = "";

/** Seed the fixtures the post-message / submit-deliverable mutations need to actually succeed. */
async function seedFixtures() {
  const human = await prisma.profile.create({
    data: { kind: "human", displayName: "Viewer Test Human" },
  });
  humanProfileId = human.id;
  const agent = await prisma.agent.create({
    data: { name: "Worker", role: "worker", workspaceId: WS },
  });
  agentId = agent.id;
  const task = await prisma.task.create({ data: { title: "Seed", description: "Seed" } });
  taskId = task.id;
}

/** Mint a real member-scoped API key (as resolve.ts issues for programmatic/agent callers). */
async function mintApiKey(): Promise<string> {
  const r = await gql(
    `mutation($n:String!){ mintApiKey(name:$n){ plainKey } }`,
    { n: "agent-cli" },
    {
      role: "admin",
    },
  );
  return r.data.mintApiKey.plainKey;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE tasks, messages, deliverables, profiles, agents, api_keys, agent_runs CASCADE`,
  );
  resetTestFeature("api_keys");
  invalidateFlagCache();
  await seedFixtures();
});

describe("viewer read-only gate — GraphQL operate mutations", () => {
  it("VIEWER is DENIED (FORBIDDEN) on create task / post message / submit deliverable", async () => {
    // NOTE: the GraphQL route masks resolver-thrown error codes over HTTP (repo convention — see
    // secret-binding-richness.test.ts), so we assert the denial (errors present + no data). The
    // FORBIDDEN *code* itself is proven at the guard level in tests/unit/rbac-member-operate.test.ts.
    const t = await gql(CREATE_TASK, { t: "X", d: "Y" }, { role: "viewer" });
    expect(t.errors).toBeDefined();
    expect(t.data?.createTask).toBeFalsy();

    const m = await gql(
      POST_MESSAGE,
      { task: taskId, from: humanProfileId, c: "hi" },
      { role: "viewer" },
    );
    expect(m.errors).toBeDefined();
    expect(m.data?.createMessage).toBeFalsy();

    const d = await gql(
      SUBMIT_DELIVERABLE,
      { task: taskId, agent: agentId, title: "D", kind: "markdown" },
      { role: "viewer" },
    );
    expect(d.errors).toBeDefined();
    expect(d.data?.submitDeliverable).toBeFalsy();

    // No writes leaked through.
    expect(await prisma.task.count({ where: { title: "X" } })).toBe(0);
    expect(await prisma.message.count()).toBe(0);
    expect(await prisma.deliverable.count()).toBe(0);
  });

  it.each(["member", "admin", "owner"] as const)(
    "%s is ALLOWED on all three operate mutations",
    async (role) => {
      const t = await gql(CREATE_TASK, { t: `task-${role}`, d: "Y" }, { role });
      expect(t.errors).toBeFalsy();
      expect(t.data.createTask.id).toBeTruthy();

      const m = await gql(
        POST_MESSAGE,
        { task: taskId, from: humanProfileId, c: `hi from ${role}` },
        { role },
      );
      expect(m.errors).toBeFalsy();
      expect(m.data.createMessage.id).toBeTruthy();

      const d = await gql(
        SUBMIT_DELIVERABLE,
        { task: taskId, agent: agentId, title: `D-${role}`, kind: "markdown" },
        { role },
      );
      expect(d.errors).toBeFalsy();
      expect(d.data.submitDeliverable.id).toBeTruthy();
    },
  );

  it("API-KEY agent (resolves as member) is ALLOWED — the gate does NOT block agents", async () => {
    const key = await mintApiKey();

    const t = await gql(CREATE_TASK, { t: "task-apikey", d: "Y" }, { bearer: key });
    expect(t.errors).toBeFalsy();
    expect(t.data.createTask.id).toBeTruthy();

    const m = await gql(
      POST_MESSAGE,
      { task: taskId, from: humanProfileId, c: "hi from agent key" },
      { bearer: key },
    );
    expect(m.errors).toBeFalsy();
    expect(m.data.createMessage.id).toBeTruthy();

    const d = await gql(
      SUBMIT_DELIVERABLE,
      { task: taskId, agent: agentId, title: "D-apikey", kind: "markdown" },
      { bearer: key },
    );
    expect(d.errors).toBeFalsy();
    expect(d.data.submitDeliverable.id).toBeTruthy();
  });
});

describe("run-bridge path is UNAFFECTED by the resolver gate", () => {
  it("an in-sandbox run posts a message via bridgePostMessage — no human tenancy, no requireRole", async () => {
    // A live run with a minted bridge token — exactly what the runner injects into the sandbox.
    const { token, hash } = mintRunBridgeToken();
    const run = await prisma.agentRun.create({
      data: {
        workspaceId: WS,
        kind: "task",
        taskId,
        agentId,
        status: "running",
        bridgeTokenHash: hash,
      },
    });

    // The bridge authenticates with the run-scoped token (NOT a GraphQL tenancy role)…
    const verified = await verifyRunBridgeToken(token);
    expect(verified?.runId).toBe(run.id);

    // …and writes straight through the service. This never enters the gated createMessage resolver,
    // so it works with zero human role — proving the gate cannot regress sandbox agents.
    const ok = await bridgePostMessage(verified!, "progress from inside the box");
    expect(ok).toBe(true);

    const posted = await prisma.message.findFirst({ where: { createdByRunId: run.id } });
    expect(posted?.content).toBe("progress from inside the box");
    // Attribution is the run's agent profile, set by the service — not a human caller.
    expect(posted?.fromProfileId).toBeTruthy();
  });
});
