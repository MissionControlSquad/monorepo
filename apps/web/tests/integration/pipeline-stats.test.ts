import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import { computePipelineStats } from "../../src/server/services/pipelines";

// Parity #101 — pipeline aggregation summary.
const WS = "ws_pipestats";
let pipelineId = "";
let stage0 = "";
let stage1 = "";

beforeEach(async () => {
  await prisma.pipelineCase.deleteMany({ where: { pipeline: { workspaceId: WS } } });
  await prisma.pipelineStage.deleteMany({ where: { pipeline: { workspaceId: WS } } });
  await prisma.pipeline.deleteMany({ where: { workspaceId: WS } });

  const p = await prisma.pipeline.create({ data: { workspaceId: WS, name: "P" } });
  pipelineId = p.id;
  const s0 = await prisma.pipelineStage.create({
    data: { pipelineId, name: "Triage", order: 0, slaMinutes: 60 },
  });
  const s1 = await prisma.pipelineStage.create({
    data: { pipelineId, name: "Review", order: 1, slaMinutes: 60 },
  });
  stage0 = s0.id;
  stage1 = s1.id;
});

async function makeCase(over: {
  status?: string;
  stageId?: string | null;
  enteredMinsAgo?: number;
  updatedMinsAgo?: number;
}) {
  const now = Date.now();
  await prisma.pipelineCase.create({
    data: {
      pipelineId,
      title: "c",
      status: (over.status ?? "open") as never,
      currentStageId: over.stageId ?? null,
      enteredStageAt: new Date(now - (over.enteredMinsAgo ?? 5) * 60_000),
      updatedAt: new Date(now - (over.updatedMinsAgo ?? 5) * 60_000),
    },
  });
}

describe("computePipelineStats (#101)", () => {
  it("summarizes counts, stale, throughput and per-stage distribution", async () => {
    // active: 2 in stage0 (one stale @120min > 60 SLA), 1 in stage1 (fresh)
    await makeCase({ stageId: stage0, enteredMinsAgo: 10 });
    await makeCase({ stageId: stage0, enteredMinsAgo: 120 }); // stale
    await makeCase({ stageId: stage1, enteredMinsAgo: 5 });
    // done: one recent (throughput), one old
    await makeCase({ status: "done", updatedMinsAgo: 30 });
    await makeCase({ status: "done", updatedMinsAgo: 60 * 48 }); // 2 days old
    // rejected: one
    await makeCase({ status: "rejected" });

    const s = await computePipelineStats(WS, pipelineId);
    expect(s).toMatchObject({
      activeCount: 3,
      doneCount: 2,
      rejectedCount: 1,
      staleCount: 1,
      completedLast24h: 1, // only the 30-min-ago done case
    });
    expect(s.byStage).toEqual([
      { stageId: stage0, stageName: "Triage", count: 2 },
      { stageId: stage1, stageName: "Review", count: 1 },
    ]);
  });

  it("returns zeros for an empty pipeline", async () => {
    const s = await computePipelineStats(WS, pipelineId);
    expect(s).toMatchObject({ activeCount: 0, doneCount: 0, staleCount: 0, completedLast24h: 0 });
    expect(s.byStage).toEqual([]);
  });
});
