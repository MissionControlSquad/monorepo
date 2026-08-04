import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  reviewAgentProductivity,
  latestProductivityReview,
  flaggedAgents,
} from "../../src/server/services/productivity-reviews";

// Parity #132 — productivity review persistence + watchdog worklist.
const WS = "ws_prod";
const HOUR = 3_600_000;

beforeEach(async () => {
  await prisma.productivityReview.deleteMany({ where: { workspaceId: WS } });
});

describe("productivity reviews (#132)", () => {
  it("assesses + persists a review and returns the latest", async () => {
    await reviewAgentProductivity({
      workspaceId: WS,
      agentId: "a1",
      signals: { idleMs: 5 * HOUR, runsCompleted: 0, runsFailed: 0 },
    });
    const latest = await latestProductivityReview(WS, "a1");
    expect(latest?.verdict).toBe("stuck");
  });

  it("flaggedAgents returns only the latest unhealthy verdict per agent", async () => {
    // a1 recovered: stuck (earlier) then productive (now) → not flagged
    const stuck = await reviewAgentProductivity({
      workspaceId: WS,
      agentId: "a1",
      signals: { idleMs: 5 * HOUR, runsCompleted: 0, runsFailed: 0 },
    });
    await prisma.productivityReview.update({
      where: { id: stuck.id },
      data: { createdAt: new Date(Date.now() - 60_000) },
    });
    await reviewAgentProductivity({
      workspaceId: WS,
      agentId: "a1",
      signals: { idleMs: 60_000, runsCompleted: 3, runsFailed: 0 },
    });
    // a2 struggling
    await reviewAgentProductivity({
      workspaceId: WS,
      agentId: "a2",
      signals: { idleMs: 60_000, runsCompleted: 1, runsFailed: 5 },
    });

    const flagged = await flaggedAgents(WS);
    expect(flagged.map((f) => f.agentId)).toEqual(["a2"]);
  });
});
