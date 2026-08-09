import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { submitFeedback, listFeedback, feedbackSummary } from "../../src/server/services/feedback";

// Parity #60/#61/#62 — feedback capture + redaction + summary.
const WS = "ws_feedback";

beforeEach(async () => {
  await prisma.feedback.deleteMany({ where: { workspaceId: WS } });
});

describe("submitFeedback (#60/#61)", () => {
  it("stores a rating + redacts secrets/PII from the comment (#61)", async () => {
    const fb = await submitFeedback({
      workspaceId: WS,
      targetType: "deliverable",
      targetId: "d1",
      rating: "up",
      comment: "great work — reach me at bob@example.com, key ghp_abcdefghijklmnopqrstuvwxyz01",
    });
    expect(fb.rating).toBe("up");
    expect(fb.comment).toContain("[redacted]");
    expect(fb.comment).not.toContain("bob@example.com");
    expect(fb.comment).not.toContain("ghp_");
  });

  it("validates target type, rating, and targetId requirement", async () => {
    await expect(
      submitFeedback({ workspaceId: WS, targetType: "nope", targetId: "x", rating: "up" }),
    ).rejects.toThrow(/target/);
    await expect(
      submitFeedback({ workspaceId: WS, targetType: "task", targetId: "t1", rating: "meh" }),
    ).rejects.toThrow(/up.*down/);
    await expect(
      submitFeedback({ workspaceId: WS, targetType: "task", rating: "up" }),
    ).rejects.toThrow(/targetId/);
  });

  it("allows general product feedback with no targetId", async () => {
    const fb = await submitFeedback({ workspaceId: WS, targetType: "general", rating: "down" });
    expect(fb.targetId).toBeNull();
  });
});

describe("listFeedback + feedbackSummary (#60)", () => {
  beforeEach(async () => {
    await submitFeedback({ workspaceId: WS, targetType: "task", targetId: "t1", rating: "up" });
    await submitFeedback({ workspaceId: WS, targetType: "task", targetId: "t1", rating: "up" });
    await submitFeedback({ workspaceId: WS, targetType: "task", targetId: "t1", rating: "down" });
    await submitFeedback({ workspaceId: WS, targetType: "task", targetId: "t2", rating: "up" });
  });

  it("filters by target", async () => {
    expect(await listFeedback(WS, { targetId: "t1" })).toHaveLength(3);
    expect(await listFeedback(WS, { targetType: "task" })).toHaveLength(4);
  });

  it("summarizes up/down tallies for a target", async () => {
    expect(await feedbackSummary(WS, "task", "t1")).toEqual({ up: 2, down: 1 });
    expect(await feedbackSummary(WS, "task", "t2")).toEqual({ up: 1, down: 0 });
  });
});
