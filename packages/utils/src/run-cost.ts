/**
 * Run cost estimation — a small, PURE rate-card for pricing one agent run from its captured token
 * usage (§3 #2, cost half). The sandbox seam captures `usage = { tokensIn, tokensOut, model }` for any
 * adapter that owns an execute()/parseLine (Claude stream-json, codex/gemini JSONL, Hermes gateway).
 * After a run finishes, {@link estimateRunCostCents} turns that usage into a cent amount the run ledger
 * (`AgentRun.costCents`) and the budget funnel (`CostEvent`) both record.
 *
 * HOW COST IS COMPUTED
 *   cents = round( tokensIn/1e6 * inUsdPerMtok * 100  +  tokensOut/1e6 * outUsdPerMtok * 100 )
 * i.e. each model has a $/million-input-token and $/million-output-token rate; we bill the run's
 * captured input+output token counts against it and round to whole cents. The rate table below is a
 * CURATED, deployment-editable approximation of published list prices for the model ids the runtime
 * adapters (`packages/utils/src/adapters.ts`) and provider list (`llm-providers.ts`) already surface —
 * it is intentionally NOT a live pricing feed. A per-run reprice path already exists
 * (`services/cost.ts` repriceCostEvent) for when a real provider amount lands.
 *
 * KNOWN vs UNKNOWN MODEL
 *   - Known model  → `{ cents: <computed>, priced: true }`. e.g. claude-opus-4-8 with
 *     tokensIn=1_000_000, tokensOut=1_000_000 → $15 + $75 = $90 = 9000 cents.
 *   - Unknown/absent model → `{ cents: 0, priced: false }`. The caller persists this as the run's
 *     `costStatus="unpriced"` and emits an `unpriced` CostEvent (amount 0) so the spend is still
 *     attributed to the agent/model/task/run and can be repriced later — it never silently bills $0
 *     as if it were the real cost.
 *
 * Model ids are matched case-insensitively; a trailing `-YYYYMMDD` snapshot date is stripped before
 * lookup (so `claude-haiku-4-5-20251001` prices as `claude-haiku-4-5`).
 */

/** $/million-tokens rates for one model: [input, output]. */
type Rate = { in: number; out: number };

/**
 * Curated $/Mtok rate card. Keys are canonical (lowercase, no date suffix) model ids drawn from the
 * runtime adapters' `models` list + the LLM provider catalog. Edit here to reprice; add a row to price
 * a new model id. Values approximate published list prices at authoring time and are not authoritative.
 */
export const RUN_COST_RATE_CARD: Record<string, Rate> = {
  // ── Claude (claude adapter `models` + anthropic provider) ──
  "claude-opus-4-8": { in: 15, out: 75 },
  "claude-opus-4-6": { in: 15, out: 75 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-sonnet-4-5": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 0.8, out: 4 },
  "claude-3-5-haiku": { in: 0.8, out: 4 },
  "claude-fable-5": { in: 1, out: 5 },
  // ── OpenAI / codex adapter ──
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  o3: { in: 2, out: 8 },
  "o3-mini": { in: 1.1, out: 4.4 },
  "o4-mini": { in: 1.1, out: 4.4 },
  "gpt-4.1": { in: 2, out: 8 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1-nano": { in: 0.1, out: 0.4 },
  // ── Gemini adapter / google provider ──
  "gemini-2.5-pro": { in: 1.25, out: 10 },
  "gemini-2.5-flash": { in: 0.3, out: 2.5 },
  "gemini-2.0-flash": { in: 0.1, out: 0.4 },
};

export interface EstimateRunCostInput {
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
}

export interface RunCostEstimate {
  /** Whole-cent cost of the run (0 when the model is unknown/absent). */
  cents: number;
  /** true = the model was found in the rate card (a real price); false = unknown → unpriced marker. */
  priced: boolean;
}

/** Canonicalize a model id for rate-card lookup: trim, lowercase, drop a trailing `-YYYYMMDD` date. */
function canonicalModelId(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/-\d{8}$/, "");
}

/**
 * Estimate the cost (in whole cents) of one run from its captured token usage + model.
 * Pure + total: never throws. Unknown/absent model → `{ cents: 0, priced: false }` (an unpriced run).
 */
export function estimateRunCostCents(input: EstimateRunCostInput): RunCostEstimate {
  const model = input.model?.trim();
  if (!model) return { cents: 0, priced: false };

  const rate = RUN_COST_RATE_CARD[canonicalModelId(model)];
  if (!rate) return { cents: 0, priced: false };

  const tokensIn = Math.max(0, input.tokensIn ?? 0);
  const tokensOut = Math.max(0, input.tokensOut ?? 0);
  const dollars = (tokensIn / 1_000_000) * rate.in + (tokensOut / 1_000_000) * rate.out;
  return { cents: Math.round(dollars * 100), priced: true };
}
