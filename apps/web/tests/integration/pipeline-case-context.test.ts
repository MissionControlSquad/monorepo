import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { recordCaseOutput, assembleCaseContext } from "../../src/server/services/pipelines";

// Parity #99 — cross-stage conversation context assembled for a case.
const WS = "ws_casectx";
let caseId = "";
let stageA = "";
let stageB = "";

beforeEach(async () => {
  await prisma.pipeline.deleteMany({ where: { workspaceId: WS } });
  const p = await prisma.pipeline.create({ data: { workspaceId: WS, name: "P" } });
  const a = await prisma.pipelineStage.create({ data: { pipelineId: p.id, name: "A", order: 0 } });
  const b = await prisma.pipelineStage.create({ data: { pipelineId: p.id, name: "B", order: 1 } });
  stageA = a.id;
  stageB = b.id;
  const c = await prisma.pipelineCase.create({
    data: { pipelineId: p.id, title: "c", currentStageId: b.id, enteredStageAt: new Date() },
  });
  caseId = c.id;
});

describe("assembleCaseContext (#99)", () => {
  it("assembles the transition timeline + accumulated outputs across stages", async () => {
    await prisma.pipelineCaseEvent.create({
      data: { caseId, type: "created", toStageId: stageA },
    });
    await prisma.pipelineCaseEvent.create({
      data: { caseId, type: "commented", note: "triaged in A" },
    });
    await prisma.pipelineCaseEvent.create({
      data: { caseId, type: "transitioned", fromStageId: stageA, toStageId: stageB },
    });
    await recordCaseOutput(WS, caseId, { key: "triage", value: { severity: "high" } });

    const ctx = await assembleCaseContext(WS, caseId);
    expect(ctx.currentStageId).toBe(stageB);
    expect(ctx.timeline.map((t) => t.type)).toEqual(["created", "commented", "transitioned"]);
    expect(ctx.timeline[1].note).toBe("triaged in A");
    expect(ctx.timeline[2].toStageId).toBe(stageB);
    expect(ctx.outputs).toEqual([{ stageId: null, key: "triage", value: { severity: "high" } }]);
  });

  it("scopes to the workspace (a foreign workspace cannot read the context)", async () => {
    await expect(assembleCaseContext("ws_other", caseId)).rejects.toThrow(/not found/);
  });
});
