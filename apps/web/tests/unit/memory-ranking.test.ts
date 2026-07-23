import { describe, it, expect } from "vitest";
import { scoreMemory, selectMemoriesForInjection } from "@agentcenter/utils";

const now = 10 * 24 * 3_600_000;
const mem = (id: string, content: string, ageDays: number) => ({
  id,
  content,
  createdAt: new Date(now - ageDays * 86_400_000),
});

describe("scoreMemory (#F17/F18)", () => {
  it("recency decays with age", () => {
    const fresh = scoreMemory(mem("a", "x", 0), { now });
    const old = scoreMemory(mem("b", "x", 14), { now });
    expect(fresh).toBeGreaterThan(old);
    expect(scoreMemory(mem("c", "x", 7), { now, halfLifeMs: 7 * 86_400_000 })).toBeCloseTo(0.5, 2);
  });

  it("query-term overlap boosts a relevant older memory", () => {
    const relevantOld = scoreMemory(mem("a", "the deploy pipeline failed on staging", 10), {
      now,
      queryTerms: ["deploy", "pipeline", "staging"],
      relevanceWeight: 0.7,
    });
    const irrelevantFresh = scoreMemory(mem("b", "lunch menu ideas", 1), {
      now,
      queryTerms: ["deploy", "pipeline", "staging"],
      relevanceWeight: 0.7,
    });
    expect(relevantOld).toBeGreaterThan(irrelevantFresh);
  });
});

describe("selectMemoriesForInjection", () => {
  it("returns the top-N by score", () => {
    const rows = [
      mem("old-relevant", "deploy pipeline staging error", 20),
      mem("fresh-noise", "random note", 0),
      mem("mid-noise", "another note", 5),
    ];
    const top = selectMemoriesForInjection(rows, 1, {
      now,
      queryTerms: ["deploy", "pipeline"],
      relevanceWeight: 0.8,
    });
    expect(top[0].id).toBe("old-relevant");
  });

  it("with no query terms, falls back to pure recency", () => {
    const rows = [mem("a", "x", 5), mem("b", "y", 1), mem("c", "z", 10)];
    expect(selectMemoriesForInjection(rows, 2, { now }).map((r) => r.id)).toEqual(["b", "a"]);
  });
});
