import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { TASK_STATUSES } from "@agentcenter/utils";
import {
  checkoutTask,
  findUnresolvedBlockers,
  assertNoUnresolvedBlockers,
} from "../../src/server/services/task-checkout";
import {
  snapshotDocumentRevision,
  listDocumentRevisions,
} from "../../src/server/services/document-revisions";
import { bridgePostMessage } from "../../src/server/services/run-bridge";

/**
 * Parity §3.12 work-item enhancements: WorkMode, backlog status, DocumentRevision snapshotting,
 * Message.createdByRunId attribution, and blocker-prevents-checkout. One cohesive slice.
 */
const SECRET = "work-item-enhancements-secret";

async function gql(query: string, variables?: Record<string, unknown>) {
  const token = await createJWT(
    { userId: "human_wi", workspaceId: "ws_wi", userRole: "admin" },
    SECRET,
  );
  const req = new Request("http://test/api/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: `bb-workspace-token=${token}` },
    body: JSON.stringify({ query, variables }),
  });
  return JSON.parse(await (await GRAPHQL(req)).text()) as {
    data?: any;
    errors?: { message: string }[];
  };
}

async function makeTask(overrides: Record<string, unknown> = {}): Promise<string> {
  return (await prisma.task.create({ data: { title: "T", description: "T", ...overrides } })).id;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE tasks, task_relations, task_labels, labels, messages, agent_runs, agents, documents, document_revisions, profiles CASCADE`,
  );
});

describe("WorkMode (Parity §3.12)", () => {
  it("defaults to standard and persists a chosen mode via create + update", async () => {
    const created = await gql(
      `mutation($t:String!,$d:String!,$w:String){createTaskFromDashboard(title:$t,description:$d,workMode:$w){id workMode}}`,
      { t: "Plan it", d: "desc", w: "planning" },
    );
    expect(created.errors).toBeUndefined();
    const id = created.data.createTaskFromDashboard.id;
    expect(created.data.createTaskFromDashboard.workMode).toBe("planning");

    // A task created without a workMode falls back to the DB default.
    const plain = await makeTask();
    expect((await prisma.task.findUniqueOrThrow({ where: { id: plain } })).workMode).toBe(
      "standard",
    );

    const updated = await gql(
      `mutation($id:String!,$w:String){updateTask(id:$id,workMode:$w){id workMode}}`,
      { id, w: "ask" },
    );
    expect(updated.errors).toBeUndefined();
    expect(updated.data.updateTask.workMode).toBe("ask");

    // An unknown mode is ignored (keeps the prior value) rather than corrupting the row.
    const bad = await gql(`mutation($id:String!,$w:String){updateTask(id:$id,workMode:$w){workMode}}`, {
      id,
      w: "nonsense",
    });
    expect(bad.data.updateTask.workMode).toBe("ask");
  });
});

describe("backlog status (Parity §3.12)", () => {
  it("is a valid persisted status ordered before inbox in the UI status list", async () => {
    expect(TASK_STATUSES[0].id).toBe("backlog");
    expect(TASK_STATUSES.findIndex((s) => s.id === "backlog")).toBeLessThan(
      TASK_STATUSES.findIndex((s) => s.id === "inbox"),
    );

    const id = await makeTask({ status: "backlog" });
    expect((await prisma.task.findUniqueOrThrow({ where: { id } })).status).toBe("backlog");

    // groupBy status-count logic sees the new bucket.
    const counts = await prisma.task.groupBy({ by: ["status"], _count: { status: true } });
    expect(counts.find((c) => c.status === "backlog")?._count.status).toBe(1);
  });
});

describe("DocumentRevision snapshotting (Parity §3.12)", () => {
  it("numbers revisions per-document and lists them newest-first; updateDocument snapshots", async () => {
    const doc = await prisma.document.create({
      data: { title: "v1", content: "hello", type: "note" },
    });

    const r1 = await snapshotDocumentRevision({ documentId: doc.id });
    expect(r1?.revision).toBe(1);
    await prisma.document.update({ where: { id: doc.id }, data: { content: "hello world" } });
    const r2 = await snapshotDocumentRevision({ documentId: doc.id });
    expect(r2?.revision).toBe(2);
    expect(r2?.content).toBe("hello world");

    const list = await listDocumentRevisions(doc.id);
    expect(list.map((r) => r.revision)).toEqual([2, 1]);

    // The GraphQL query surfaces the same history.
    const res = await gql(`query($id:String!){documentRevisions(documentId:$id){revision content}}`, {
      id: doc.id,
    });
    expect(res.errors).toBeUndefined();
    expect(res.data.documentRevisions.map((r: any) => r.revision)).toEqual([2, 1]);
  });
});

describe("Message.createdByRunId attribution (Parity §3.12)", () => {
  it("stamps the posting run on a run-authored task comment", async () => {
    const agent = await prisma.agent.create({
      data: { name: "Runner", role: "dev", username: "runner-wi", apiKeyHash: "h", apiKeyPrefix: "p" },
    });
    const taskId = await makeTask();
    const run = await prisma.agentRun.create({
      data: { workspaceId: "ws_wi", agentId: agent.id, taskId, kind: "sandbox", status: "running" },
    });

    const posted = await bridgePostMessage(
      { runId: run.id, workspaceId: "ws_wi", taskId, agentId: agent.id },
      "run output here",
    );
    expect(posted).toBe(true);

    const msg = await prisma.message.findFirstOrThrow({
      where: { taskId },
      include: { createdByRun: true },
    });
    expect(msg.createdByRunId).toBe(run.id);
    expect(msg.createdByRun?.id).toBe(run.id);

    // A plain (human/API) message has no run attribution.
    const plain = await prisma.message.create({
      data: { taskId, fromProfileId: msg.fromProfileId, content: "manual" },
    });
    expect(plain.createdByRunId).toBeNull();
  });
});

describe("task labels (Parity §3.12)", () => {
  it("attaches a label by name (created if new), lists it, and detaches it", async () => {
    const taskId = await makeTask();
    const add = await gql(
      `mutation($t:String!,$n:String!,$c:String){addTaskLabel(taskId:$t,name:$n,color:$c){labelId label{name color}}}`,
      { t: taskId, n: "urgent", c: "#ff0000" },
    );
    expect(add.errors).toBeUndefined();
    const labelId = add.data.addTaskLabel.labelId;
    expect(add.data.addTaskLabel.label.name).toBe("urgent");

    // Re-adding the same label is idempotent (no duplicate join row).
    await gql(`mutation($t:String!,$n:String!){addTaskLabel(taskId:$t,name:$n){id}}`, {
      t: taskId,
      n: "urgent",
    });
    const list = await gql(`query($t:String!){taskLabels(taskId:$t){labelId}}`, { t: taskId });
    expect(list.data.taskLabels).toHaveLength(1);

    const remove = await gql(
      `mutation($t:String!,$l:String!){removeTaskLabel(taskId:$t,labelId:$l)}`,
      { t: taskId, l: labelId },
    );
    expect(remove.data.removeTaskLabel).toBe(true);
    const after = await gql(`query($t:String!){taskLabels(taskId:$t){labelId}}`, { t: taskId });
    expect(after.data.taskLabels).toHaveLength(0);
  });
});

describe("blocker-prevents-checkout at claim time (Parity §3.12)", () => {
  it("refuses checkout while a blocker is unresolved, then allows it once resolved", async () => {
    const blocker = await makeTask({ status: "in_progress" });
    const blocked = await makeTask({ blockedByTaskId: blocker });
    const profile = await prisma.profile.create({
      data: { kind: "agent", displayName: "P", username: "p-wi" },
    });

    expect((await findUnresolvedBlockers(blocked)).map((b) => b.id)).toEqual([blocker]);
    await expect(assertNoUnresolvedBlockers(blocked)).rejects.toThrow(/blocked by unresolved work/i);
    await expect(checkoutTask(blocked, profile.id, 300)).rejects.toThrow(/blocked by unresolved/i);

    // Also covers the typed `blocks` relation edge.
    const relBlocker = await makeTask({ status: "inbox" });
    const relBlocked = await makeTask();
    await prisma.taskRelation.create({
      data: { sourceTaskId: relBlocker, targetTaskId: relBlocked, type: "blocks" },
    });
    await expect(checkoutTask(relBlocked, profile.id, 300)).rejects.toThrow(/blocked by unresolved/i);

    // Resolve the blocker → checkout now succeeds and returns a fencing token.
    await prisma.task.update({ where: { id: blocker }, data: { status: "done" } });
    const res = await checkoutTask(blocked, profile.id, 300);
    expect(res.token).toBeTruthy();
    expect(res.taskId).toBe(blocked);
  });
});
