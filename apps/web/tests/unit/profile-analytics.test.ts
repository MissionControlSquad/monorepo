import { describe, it, expect } from "vitest";
import { summarizeProfileCosts, completionRate } from "@agentcenter/utils";

describe("summarizeProfileCosts", () => {
  it("totals tokens + spend and buckets by model (spend-desc)", () => {
    const r = summarizeProfileCosts([
      { model: "opus", tokensIn: 100, tokensOut: 50, amountCents: 300 },
      { model: "haiku", tokensIn: 200, tokensOut: 20, amountCents: 40 },
      { model: "opus", tokensIn: 10, tokensOut: 5, amountCents: 100 },
    ]);
    expect(r.totalTokensIn).toBe(310);
    expect(r.totalTokensOut).toBe(75);
    expect(r.totalSpendCents).toBe(440);
    expect(r.byModel.map((m) => m.model)).toEqual(["opus", "haiku"]); // spend desc
    expect(r.byModel[0]).toMatchObject({ model: "opus", tokensIn: 110, spendCents: 400 });
  });

  it("maps a null model to 'unknown' and handles empty input", () => {
    expect(summarizeProfileCosts([])).toEqual({
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalSpendCents: 0,
      byModel: [],
    });
    const r = summarizeProfileCosts([{ model: null, tokensIn: 1, tokensOut: 1, amountCents: 1 }]);
    expect(r.byModel[0].model).toBe("unknown");
  });
});

describe("completionRate", () => {
  it("is 0 when nothing assigned, clamps to [0,1]", () => {
    expect(completionRate(0, 0)).toBe(0);
    expect(completionRate(3, 4)).toBe(0.75);
    expect(completionRate(5, 4)).toBe(1); // clamp
    expect(completionRate(-1, 4)).toBe(0); // clamp
  });
});
