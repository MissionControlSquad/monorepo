import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import { invalidateFlagCache } from "../../src/server/feature-flags";
import { castVote, voteSummary } from "../../src/server/services/deliverable-votes";

/** Tier C: deliverable votes — service + GraphQL (per-caller vote) + feature gate. */
const SECRET = "votes-secret";

async function gql(query: string, variables: Record<string, unknown>, userId = "human_a") {
  const token = await createJWT({ userId, workspaceId: "ws_x", userRole: "member" }, SECRET);
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
async function makeDeliverable(): Promise<string> {
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "H" } });
  const task = await prisma.task.create({ data: { title: "T", description: "T" } });
  const d = await prisma.deliverable.create({
    data: { taskId: task.id, profileId: p.id, title: "D", kind: "markdown", content: "x" },
  });
  return d.id;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE tasks, deliverables, deliverable_votes, profiles CASCADE`,
  );
});

describe("deliverable votes service (Tier C)", () => {
  it("aggregates up/down across voters; re-vote replaces; 0 clears", async () => {
    const d = await makeDeliverable();
    await castVote({ deliverableId: d, voterId: "alice", value: 1 });
    await castVote({ deliverableId: d, voterId: "bob", value: 1 });
    let s = await castVote({ deliverableId: d, voterId: "carol", value: -1 });
    expect(s).toMatchObject({ score: 1, upCount: 2, downCount: 1 });

    // alice flips to down (replace, not add)
    s = await castVote({ deliverableId: d, voterId: "alice", value: -1 });
    expect(s).toMatchObject({ upCount: 1, downCount: 2, myVote: -1 });

    // alice clears
    s = await castVote({ deliverableId: d, voterId: "alice", value: 0 });
    expect(s).toMatchObject({ upCount: 1, downCount: 1, myVote: 0 });
  });

  it("rejects an invalid value and a missing deliverable", async () => {
    const d = await makeDeliverable();
    await expect(castVote({ deliverableId: d, voterId: "x", value: 2 })).rejects.toThrow(
      /1, -1, or 0/,
    );
    await expect(castVote({ deliverableId: "nope", voterId: "x", value: 1 })).rejects.toThrow(
      /not found/,
    );
  });
});

describe("deliverable votes GraphQL (Tier C)", () => {
  it("each caller votes as themselves; myVote is per-caller; feature-gated", async () => {
    const d = await makeDeliverable();
    const CAST = `mutation($d:String!,$v:Int!){ castDeliverableVote(deliverableId:$d, value:$v){ score myVote } }`;
    const a = await gql(CAST, { d, v: 1 }, "human_a");
    expect(a.data.castDeliverableVote).toMatchObject({ score: 1, myVote: 1 });
    const b = await gql(CAST, { d, v: 1 }, "human_b");
    expect(b.data.castDeliverableVote.score).toBe(2);

    // human_a sees myVote=1, a fresh voter sees myVote=0
    const seenByA = await gql(
      `query($d:String!){ deliverableVotes(deliverableId:$d){ score myVote } }`,
      { d },
      "human_a",
    );
    expect(seenByA.data.deliverableVotes).toMatchObject({ score: 2, myVote: 1 });
    const seenByC = await gql(
      `query($d:String!){ deliverableVotes(deliverableId:$d){ myVote } }`,
      { d },
      "human_c",
    );
    expect(seenByC.data.deliverableVotes.myVote).toBe(0);

    try {
      await prisma.featureFlag.upsert({
        where: { key: "voting" },
        create: { key: "voting", enabled: false, managedBy: "user" },
        update: { enabled: false },
      });
      invalidateFlagCache();
      const gated = await gql(CAST, { d, v: 1 }, "human_a");
      expect(gated.errors).toBeDefined();
    } finally {
      await prisma.featureFlag.deleteMany({ where: { key: "voting" } });
      invalidateFlagCache();
    }
    void voteSummary;
  });
});
