/**
 * Rolling cost windows (Domain 12 GAP-6 A10) — pure, shared via @agentcenter/utils. Defines the
 * standard rolling spend windows (5h / 24h / 7d) and folds cost rows into per-provider-per-window
 * totals. No I/O; the caller passes `now` and the rows (avoids Date.now() in sandboxes).
 */

export interface CostWindowDef {
  key: string;
  label: string;
  ms: number;
}

export const COST_WINDOWS: CostWindowDef[] = [
  { key: "5h", label: "Last 5 hours", ms: 5 * 60 * 60 * 1000 },
  { key: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
];

export interface CostRow {
  provider: string | null;
  amountCents: number;
  occurredAt: Date;
}

export interface ProviderWindowSpend {
  provider: string;
  window: string;
  amountCents: number;
  eventCount: number;
}

/**
 * Pure: fold cost rows into (provider × window) spend totals over the rolling windows ending at `now`.
 * A row counts toward a window when `occurredAt >= now - window.ms`. Unattributed provider → "unknown".
 */
export function summarizeCostWindows(
  rows: CostRow[],
  now: Date,
  windows: CostWindowDef[] = COST_WINDOWS,
): ProviderWindowSpend[] {
  const acc = new Map<string, ProviderWindowSpend>();
  const nowMs = now.getTime();
  for (const row of rows) {
    const provider = row.provider ?? "unknown";
    const age = nowMs - row.occurredAt.getTime();
    for (const w of windows) {
      if (age < 0 || age > w.ms) continue; // outside this window (future rows excluded)
      const key = `${provider}|${w.key}`;
      const cur = acc.get(key) ?? { provider, window: w.key, amountCents: 0, eventCount: 0 };
      cur.amountCents += Math.trunc(row.amountCents);
      cur.eventCount += 1;
      acc.set(key, cur);
    }
  }
  return [...acc.values()].sort(
    (a, b) => a.provider.localeCompare(b.provider) || b.amountCents - a.amountCents,
  );
}
