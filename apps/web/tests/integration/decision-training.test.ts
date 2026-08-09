import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  recordDecision,
  setDecisionOutcome,
  listDecisions,
} from "../../src/server/services/decision-training";

// Parity #40 — decision-training capture.
const WS = "ws_decisions";
beforeEach(async () => {
  await prisma.decisionRecord.deleteMany({ where: { workspaceId: WS } });
});

describe("decision-training (#40)", () => {
  it("records a decision, redacting secrets from context/rationale", async () => {
    const d = await recordDecision({
      workspaceId: WS,
      agentId: "a1",
      decisionType: "tool_choice",
      context: "chose shell; token=ghp_abcdefghijklmnopqrstuvwxyz01 was present",
      choice: "shell.exec",
      rationale: "email me at bob@x.io",
    });
    expect(d.choice).toBe("shell.exec");
    expect(d.context).not.toContain("ghp_");
    expect(d.rationale).not.toContain("bob@x.io");
    expect(d.outcome).toBeNull();
  });

  it("backfills the outcome (validated) and lists/filters", async () => {
    const d = await recordDecision({
      workspaceId: WS,
      decisionType: "route",
      context: "c",
      choice: "x",
    });
    await expect(setDecisionOutcome(WS, d.id, "nope")).rejects.toThrow(/outcome/);
    const updated = await setDecisionOutcome(WS, d.id, "success");
    expect(updated.outcome).toBe("success");

    await recordDecision({
      workspaceId: WS,
      decisionType: "route",
      context: "c",
      choice: "y",
      agentId: "a2",
    });
    expect(await listDecisions(WS, { decisionType: "route" })).toHaveLength(2);
    expect(await listDecisions(WS, { agentId: "a2" })).toHaveLength(1);
  });

  it("validates required fields", async () => {
    await expect(
      recordDecision({ workspaceId: WS, decisionType: " ", context: "c", choice: "x" }),
    ).rejects.toThrow(/decisionType/);
  });
});
