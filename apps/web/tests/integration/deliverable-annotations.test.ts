import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { FLAG_KEYS } from "@agentcenter/utils";
import { prisma } from "../../src/server/prisma";
import { createJWT } from "../../src/lib/jwt";
import { POST as GRAPHQL } from "../../app/api/graphql/route";
import {
  invalidateFlagCache,
  setTestFeature,
  resetTestFeature,
} from "../../src/server/feature-flags";
import {
  addDeliverableAnnotation,
  setAnnotationResolved,
  deleteDeliverableAnnotation,
  deliverableAnnotations,
} from "../../src/server/services/deliverable-annotations";

/** Tier C: deliverable review annotations — service + GraphQL + feature gate. */
const SECRET = "annotations-secret";

async function gql(query: string, variables?: Record<string, unknown>) {
  const token = await createJWT(
    { userId: "human_x", workspaceId: "ws_x", userRole: "admin" },
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

async function makeDeliverable(): Promise<string> {
  const p = await prisma.profile.create({ data: { kind: "human", displayName: "H" } });
  const task = await prisma.task.create({ data: { title: "T", description: "T" } });
  const d = await prisma.deliverable.create({
    data: { taskId: task.id, profileId: p.id, title: "D", kind: "markdown", content: "# hi" },
  });
  return d.id;
}

beforeAll(() => {
  process.env.SYSTEM_SECRET = SECRET;
});
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE tasks, deliverables, deliverable_annotations, profiles CASCADE`,
  );
});

describe("deliverable annotations service (Tier C)", () => {
  it("adds, resolves, and deletes annotations", async () => {
    const d = await makeDeliverable();
    const a = await addDeliverableAnnotation({ deliverableId: d, body: "fix this", quote: "hi" });
    expect(a.resolved).toBe(false);
    expect(await deliverableAnnotations(d)).toHaveLength(1);

    const resolved = await setAnnotationResolved(a.id, true);
    expect(resolved.resolved).toBe(true);

    expect(await deleteDeliverableAnnotation(a.id)).toBe(true);
    expect(await deliverableAnnotations(d)).toHaveLength(0);
  });

  it("rejects an empty body and a missing deliverable", async () => {
    const d = await makeDeliverable();
    await expect(addDeliverableAnnotation({ deliverableId: d, body: "   " })).rejects.toThrow(
      /body is required/,
    );
    await expect(addDeliverableAnnotation({ deliverableId: "nope", body: "x" })).rejects.toThrow(
      /deliverable not found/,
    );
  });
});

describe("deliverable annotations GraphQL (Tier C)", () => {
  it("round-trips + is feature-gated", async () => {
    const d = await makeDeliverable();
    const add = await gql(
      `mutation($d:String!){ addDeliverableAnnotation(deliverableId:$d, body:"needs work"){ id } }`,
      { d },
    );
    expect(add.errors).toBeFalsy();
    const id = add.data.addDeliverableAnnotation.id;

    const res = await gql(
      `mutation($id:String!){ resolveDeliverableAnnotation(id:$id, resolved:true){ id resolved } }`,
      { id },
    );
    expect(res.data.resolveDeliverableAnnotation.resolved).toBe(true);

    const list = await gql(
      `query($d:String!){ deliverableAnnotations(deliverableId:$d){ id resolved } }`,
      { d },
    );
    expect(list.data.deliverableAnnotations).toHaveLength(1);

    try {
      setTestFeature(FLAG_KEYS.ANNOTATIONS, false);
      invalidateFlagCache();
      const gated = await gql(
        `mutation($d:String!){ addDeliverableAnnotation(deliverableId:$d, body:"x"){ id } }`,
        { d },
      );
      expect(gated.errors).toBeDefined();
    } finally {
      resetTestFeature(FLAG_KEYS.ANNOTATIONS);
      invalidateFlagCache();
    }
  });
});
