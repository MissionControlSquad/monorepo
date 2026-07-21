import { describe, it, expect } from "vitest";
import { recordCostEvent, repriceCostEvent } from "../../src/server/services/cost";
import { prisma } from "../../src/server/prisma";

/**
 * Domain 12 A13 — the reprice drill-down. Agents may report a run with no final price
 * (costStatus "unpriced"); an admin later enters the real amount. This asserts the pieces the new
 * UI relies on: an unpriced event is findable, repricing corrects the amount and flips it back to
 * "reported" so it leaves the unpriced list.
 */
const WS = "ws_reprice_test";

describe("unpriced cost reprice (Domain 12 A13)", () => {
  it("lists unpriced events and reprices them out of the list", async () => {
    await prisma.costEvent.deleteMany({ where: { workspaceId: WS } });

    const priced = await recordCostEvent({ workspaceId: WS, amountCents: 100 });
    const unpriced = await recordCostEvent({
      workspaceId: WS,
      amountCents: 0,
      costStatus: "unpriced",
    });

    // Only the unpriced one is in the unpriced set.
    const before = await prisma.costEvent.findMany({
      where: { workspaceId: WS, costStatus: "unpriced" },
    });
    expect(before.map((e) => e.id)).toEqual([unpriced.id]);
    expect(before.map((e) => e.id)).not.toContain(priced.id);

    // Reprice → amount set, status back to reported, drops out of the unpriced set.
    const updated = await repriceCostEvent(WS, unpriced.id, 250);
    expect(updated.amountCents).toBe(250);
    expect(updated.costStatus).toBe("reported");

    const after = await prisma.costEvent.findMany({
      where: { workspaceId: WS, costStatus: "unpriced" },
    });
    expect(after).toHaveLength(0);
  });

  it("refuses to reprice a cost event from another workspace", async () => {
    const ev = await recordCostEvent({ workspaceId: WS, amountCents: 0, costStatus: "unpriced" });
    await expect(repriceCostEvent("ws_other", ev.id, 100)).rejects.toThrow(/not found/i);
  });
});
