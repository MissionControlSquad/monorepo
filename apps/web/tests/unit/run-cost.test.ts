import { describe, it, expect } from "vitest";
import { estimateRunCostCents, RUN_COST_RATE_CARD } from "@agentcenter/utils";

// §3 #2 cost half: the pure rate-card. A KNOWN model prices from its $/Mtok row; an UNKNOWN/absent
// model returns { cents: 0, priced: false } (the caller persists that as an `unpriced` run + CostEvent).
describe("estimateRunCostCents", () => {
  it("prices a known model from the rate card (opus 4.8, 100 in / 50 out → 1 cent)", () => {
    // (100/1e6 * $15) + (50/1e6 * $75) = $0.0015 + $0.00375 = $0.00525 → 0.525¢ → rounds to 1¢.
    const r = estimateRunCostCents({ model: "claude-opus-4-8", tokensIn: 100, tokensOut: 50 });
    expect(r).toEqual({ cents: 1, priced: true });
  });

  it("prices at exact $/Mtok for 1M tokens each (opus → $15 + $75 = $90 = 9000¢)", () => {
    const r = estimateRunCostCents({
      model: "claude-opus-4-8",
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });
    expect(r).toEqual({ cents: 9000, priced: true });
  });

  it("prices sonnet/haiku/gemini/gpt rows from the same table", () => {
    // sonnet-5: $3/$15 per Mtok → 1M/1M = $18 = 1800¢
    expect(
      estimateRunCostCents({ model: "claude-sonnet-5", tokensIn: 1e6, tokensOut: 1e6 }),
    ).toEqual({ cents: 1800, priced: true });
    // gpt-4o-mini: $0.15/$0.60 → 1M/1M = $0.75 = 75¢
    expect(estimateRunCostCents({ model: "gpt-4o-mini", tokensIn: 1e6, tokensOut: 1e6 })).toEqual({
      cents: 75,
      priced: true,
    });
    // gemini-2.5-flash: $0.30/$2.50 → 1M/1M = $2.80 = 280¢
    expect(
      estimateRunCostCents({ model: "gemini-2.5-flash", tokensIn: 1e6, tokensOut: 1e6 }),
    ).toEqual({ cents: 280, priced: true });
  });

  it("matches case-insensitively and strips a trailing -YYYYMMDD snapshot date", () => {
    expect(estimateRunCostCents({ model: "CLAUDE-OPUS-4-8", tokensIn: 1e6, tokensOut: 0 })).toEqual(
      {
        cents: 1500,
        priced: true,
      },
    );
    // claude-haiku-4-5-20251001 canonicalizes to claude-haiku-4-5 ($0.80/$4).
    expect(
      estimateRunCostCents({ model: "claude-haiku-4-5-20251001", tokensIn: 1e6, tokensOut: 1e6 }),
    ).toEqual({ cents: 480, priced: true });
  });

  it("returns priced:false with 0 cents for an unknown model", () => {
    expect(
      estimateRunCostCents({ model: "totally-unknown-model", tokensIn: 1000, tokensOut: 2000 }),
    ).toEqual({ cents: 0, priced: false });
  });

  it("returns priced:false for a missing/blank model", () => {
    expect(estimateRunCostCents({ tokensIn: 1e6, tokensOut: 1e6 })).toEqual({
      cents: 0,
      priced: false,
    });
    expect(estimateRunCostCents({ model: "", tokensIn: 10, tokensOut: 10 })).toEqual({
      cents: 0,
      priced: false,
    });
    expect(estimateRunCostCents({ model: null, tokensIn: 10, tokensOut: 10 })).toEqual({
      cents: 0,
      priced: false,
    });
  });

  it("clamps negative/absent token counts to 0 (never throws)", () => {
    expect(
      estimateRunCostCents({ model: "claude-opus-4-8", tokensIn: -5, tokensOut: -10 }),
    ).toEqual({ cents: 0, priced: true });
    expect(estimateRunCostCents({ model: "claude-opus-4-8" })).toEqual({ cents: 0, priced: true });
  });

  it("exposes the rate card with the model ids the adapters/providers surface", () => {
    // The claude adapter's curated `models` list must all be priced.
    for (const m of ["claude-opus-4-8", "claude-sonnet-5", "claude-haiku-4-5", "claude-fable-5"]) {
      expect(RUN_COST_RATE_CARD[m]).toBeDefined();
    }
  });
});
