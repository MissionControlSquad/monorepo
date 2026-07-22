import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "../../src/server/prisma";
import {
  writeSummarySlot,
  finalizeSummarySlot,
  getContinuationSummary,
  listSummarySlots,
} from "../../src/server/services/summary-slots";

// Parity #142/#156/#157 — continuation summaries (rolling draft → finalize → carry forward).
const WS = "ws_summary";
const AGENT = "agent_s";

beforeEach(async () => {
  await prisma.summarySlot.deleteMany({ where: { workspaceId: WS } });
});

describe("summary slots (#157/#156/#142)", () => {
  it("writes a rolling draft (upsert, one active draft per slot)", async () => {
    await writeSummarySlot({ workspaceId: WS, agentId: AGENT, content: "step 1" });
    await writeSummarySlot({ workspaceId: WS, agentId: AGENT, content: "step 1, step 2" });
    const drafts = await prisma.summarySlot.findMany({
      where: { workspaceId: WS, agentId: AGENT, status: "draft" },
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0].content).toBe("step 1, step 2");
  });

  it("finalizes the draft at run end (#156) and carries it into a continuation (#142)", async () => {
    await writeSummarySlot({
      workspaceId: WS,
      agentId: AGENT,
      content: "run 1 summary",
      runId: "r1",
    });
    // nothing finalized yet
    expect(await getContinuationSummary(WS, AGENT)).toBeNull();

    const finalized = await finalizeSummarySlot(WS, AGENT);
    expect(finalized?.status).toBe("finalized");

    const carried = await getContinuationSummary(WS, AGENT);
    expect(carried?.content).toBe("run 1 summary");

    // next run writes a fresh draft; the finalized one remains the carried summary until re-finalized
    await writeSummarySlot({ workspaceId: WS, agentId: AGENT, content: "run 2 draft" });
    expect((await getContinuationSummary(WS, AGENT))?.content).toBe("run 1 summary");
  });

  it("finalize is a no-op when there is no draft", async () => {
    expect(await finalizeSummarySlot(WS, AGENT)).toBeNull();
  });

  it("lists draft + finalized history for an agent", async () => {
    await writeSummarySlot({ workspaceId: WS, agentId: AGENT, content: "a" });
    await finalizeSummarySlot(WS, AGENT);
    await writeSummarySlot({ workspaceId: WS, agentId: AGENT, content: "b" });
    expect(await listSummarySlots(WS, AGENT)).toHaveLength(2);
  });
});
