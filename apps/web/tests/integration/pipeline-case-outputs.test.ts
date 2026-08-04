import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { recordCaseOutput, listCaseOutputs } from "../../src/server/services/pipelines";

// Parity #98 — structured per-stage pipeline case outputs.
const WS = "ws_caseout";
let caseId = "";

beforeEach(async () => {
  await prisma.pipeline.deleteMany({ where: { workspaceId: WS } });
  const p = await prisma.pipeline.create({ data: { workspaceId: WS, name: "P" } });
  const s = await prisma.pipelineStage.create({ data: { pipelineId: p.id, name: "S", order: 0 } });
  const c = await prisma.pipelineCase.create({
    data: { pipelineId: p.id, title: "c", currentStageId: s.id, enteredStageAt: new Date() },
  });
  caseId = c.id;
});

describe("pipeline case outputs (#98)", () => {
  it("records + lists structured outputs (JSON values), oldest first", async () => {
    await recordCaseOutput(WS, caseId, { key: "score", value: 0.9 });
    await recordCaseOutput(WS, caseId, { key: "labels", value: ["a", "b"] });
    const outs = await listCaseOutputs(WS, caseId);
    expect(outs.map((o) => o.key)).toEqual(["score", "labels"]);
    expect(outs[1].value).toEqual(["a", "b"]);
  });

  it("validates key and scopes to the workspace", async () => {
    await expect(recordCaseOutput(WS, caseId, { key: "  ", value: 1 })).rejects.toThrow(/key/);
    await expect(recordCaseOutput("ws_other", caseId, { key: "x", value: 1 })).rejects.toThrow(
      /not found/,
    );
  });
});
