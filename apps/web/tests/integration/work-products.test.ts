import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { POST } from "../../app/api/graphql/route";
import { createJWT } from "../../src/lib/jwt";
import { prisma } from "../../src/server/prisma";
import { invalidateFlagCache } from "../../src/server/feature-flags";

/**
 * Domain 8 G1 — work-product taxonomy: output-type deliverables (PR/branch/…) with a review-state
 * gate, single canonical primary per (task,kind), and a board-gated approval that agents can't self-do.
 */
const SECRET = "wp-test-secret";
const WS = "ws_wp";
let taskId = "";
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
    : { errors: [] };
}
async function cookieFor(role: "admin" | "member") {
  return `bb-workspace-token=${await createJWT({ userId: humanId, workspaceId: WS, userRole: role }, SECRET)}`;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE deliverables, tasks, profiles CASCADE`);
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "Reviewer" } });
  humanId = p.id;
  const task = await prisma.task.create({ data: { title: "Ship it", description: "d" } });
  taskId = task.id;
  await prisma.featureFlag.upsert({
    where: { key: "work_products" },
    create: { key: "work_products", enabled: true, managedBy: "user" },
    update: { enabled: true },
  });
  invalidateFlagCache();
});

const CREATE = `mutation($t:String!,$k:String!,$title:String!,$primary:Boolean){
  createWorkProduct(taskId:$t, kind:$k, title:$title, makePrimary:$primary){ id kind isPrimary reviewState outputStatus }
}`;

describe("work products (Domain 8 G1)", () => {
  it("creates an output-type work product with a review gate; rejects non-output kinds", async () => {
    const member = await cookieFor("member");
    const pr = await gql(CREATE, { t: taskId, k: "pull_request", title: "Add nav" }, member);
    expect(pr.errors).toBeFalsy();
    expect(pr.data.createWorkProduct).toMatchObject({
      kind: "pull_request",
      isPrimary: true,
      reviewState: "none",
      outputStatus: "active",
    });

    const bad = await gql(CREATE, { t: taskId, k: "markdown", title: "doc" }, member);
    expect(bad.errors).toBeDefined(); // markdown is not a work-product kind
  });

  it("keeps a single canonical primary per (task, kind)", async () => {
    const member = await cookieFor("member");
    const first = await gql(CREATE, { t: taskId, k: "pull_request", title: "v1" }, member);
    const second = await gql(CREATE, { t: taskId, k: "pull_request", title: "v2" }, member);
    expect(second.data.createWorkProduct.isPrimary).toBe(true);
    // the first was demoted
    const firstRow = await prisma.deliverable.findUniqueOrThrow({
      where: { id: first.data.createWorkProduct.id },
    });
    expect(firstRow.isPrimary).toBe(false);
    // a different kind has its own primary
    const branch = await gql(CREATE, { t: taskId, k: "branch", title: "feat/x" }, member);
    expect(branch.data.createWorkProduct.isPrimary).toBe(true);
  });

  it("only a board admin can set review state; a needs_review PR can be approved", async () => {
    const member = await cookieFor("member");
    // create a PR then move it to needs_review via status/review flow
    const pr = (await gql(CREATE, { t: taskId, k: "pull_request", title: "Add nav" }, member)).data
      .createWorkProduct;
    // put it into review
    await prisma.deliverable.update({
      where: { id: pr.id },
      data: { reviewState: "needs_review", outputStatus: "ready_for_review" },
    });

    const SET_REVIEW = `mutation($id:String!,$s:String!){ setWorkProductReviewState(deliverableId:$id, reviewState:$s){ id reviewState outputStatus } }`;
    // member (agent-equivalent) cannot approve
    const denied = await gql(SET_REVIEW, { id: pr.id, s: "approved" }, member);
    expect(denied.errors).toBeDefined();

    // admin approves → reviewState approved + status advances
    const ok = await gql(SET_REVIEW, { id: pr.id, s: "approved" }, await cookieFor("admin"));
    expect(ok.data.setWorkProductReviewState).toMatchObject({
      reviewState: "approved",
      outputStatus: "approved",
    });
  });

  it("rejects an illegal status transition", async () => {
    const member = await cookieFor("member");
    const pr = (await gql(CREATE, { t: taskId, k: "pull_request", title: "x" }, member)).data
      .createWorkProduct;
    const SET_STATUS = `mutation($id:String!,$s:String!){ setWorkProductStatus(deliverableId:$id, status:$s){ id outputStatus } }`;
    // active → merged is illegal (must be approved first)
    const bad = await gql(SET_STATUS, { id: pr.id, s: "merged" }, member);
    expect(bad.errors).toBeDefined();
    // active → ready_for_review is legal
    const ok = await gql(SET_STATUS, { id: pr.id, s: "ready_for_review" }, member);
    expect(ok.data.setWorkProductStatus.outputStatus).toBe("ready_for_review");
  });
});
