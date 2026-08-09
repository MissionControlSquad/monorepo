import { describe, it, expect } from "vitest";
import { severityRank, rankAndCount, type AttentionItem } from "@agentcenter/utils";

// Epic #20: pure severity ranking + feed assembly. No DB.

const item = (over: Partial<AttentionItem>): AttentionItem => ({
  id: "x",
  sourceKind: "approval",
  severity: "high",
  subjectKind: "approval",
  subjectId: "s",
  title: "t",
  whyNow: "w",
  activityAt: "2026-07-13T00:00:00.000Z",
  ...over,
});

describe("severityRank", () => {
  it("orders critical < high < medium < low", () => {
    expect(severityRank("critical")).toBeLessThan(severityRank("high"));
    expect(severityRank("high")).toBeLessThan(severityRank("medium"));
    expect(severityRank("medium")).toBeLessThan(severityRank("low"));
  });
  it("sorts unknown severities last", () => {
    expect(severityRank("mystery")).toBeGreaterThan(severityRank("low"));
  });
});

describe("rankAndCount", () => {
  it("sorts by severity, then recency desc, and counts by source", () => {
    const feed = rankAndCount([
      item({ id: "a", severity: "medium", sourceKind: "blocker_attention" }),
      item({ id: "b", severity: "critical", sourceKind: "budget_alert" }),
      item({
        id: "c",
        severity: "high",
        sourceKind: "approval",
        activityAt: "2026-07-10T00:00:00.000Z",
      }),
      item({
        id: "d",
        severity: "high",
        sourceKind: "approval",
        activityAt: "2026-07-12T00:00:00.000Z",
      }),
    ]);
    expect(feed.items.map((i) => i.id)).toEqual(["b", "d", "c", "a"]); // critical, then high (recent first), then medium
    expect(feed.totalCount).toBe(4);
    expect(feed.countsBySourceKind).toEqual({
      budget_alert: 1,
      approval: 2,
      blocker_attention: 1,
    });
  });

  it("is empty for no items", () => {
    expect(rankAndCount([])).toEqual({ totalCount: 0, countsBySourceKind: {}, items: [] });
  });

  it("does not mutate the input array", () => {
    const input = [item({ id: "a", severity: "low" }), item({ id: "b", severity: "critical" })];
    rankAndCount(input);
    expect(input.map((i) => i.id)).toEqual(["a", "b"]);
  });
});
