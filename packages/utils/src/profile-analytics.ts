/**
 * Per-profile analytics bucketers (member productivity/cost dashboard) — shared across all apps.
 * Import from @agentcenter/utils. Pure: the web service runs the DB group-bys/aggregates and calls
 * these to shape the result. App-data only (activity/tasks/cost) — human identity stays in buildbase.
 */

export interface CostByModel {
  model: string;
  tokensIn: number;
  tokensOut: number;
  spendCents: number;
}

export interface ProfileCostSummary {
  totalTokensIn: number;
  totalTokensOut: number;
  totalSpendCents: number;
  byModel: CostByModel[]; // sorted by spend desc
}

type CostRow = {
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  amountCents: number;
};

/** Pure: total tokens + spend and a per-model breakdown (spend-desc). Null model → "unknown". */
export function summarizeProfileCosts(rows: CostRow[]): ProfileCostSummary {
  const byModel = new Map<string, CostByModel>();
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalSpendCents = 0;

  for (const r of rows) {
    totalTokensIn += r.tokensIn;
    totalTokensOut += r.tokensOut;
    totalSpendCents += r.amountCents;
    const key = r.model || "unknown";
    const entry = byModel.get(key) ?? { model: key, tokensIn: 0, tokensOut: 0, spendCents: 0 };
    entry.tokensIn += r.tokensIn;
    entry.tokensOut += r.tokensOut;
    entry.spendCents += r.amountCents;
    byModel.set(key, entry);
  }

  return {
    totalTokensIn,
    totalTokensOut,
    totalSpendCents,
    byModel: [...byModel.values()].sort((a, b) => b.spendCents - a.spendCents),
  };
}

/** Pure: completion rate in [0,1]; 0 when there is nothing assigned. */
export function completionRate(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, completed / total));
}
