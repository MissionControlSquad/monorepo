/**
 * Attention feed — shared severity/source vocabulary + ranking (Epic #20). Shared across all apps
 * (web, mobile, desktop). Import from @agentcenter/utils; do NOT duplicate these as string literals.
 * Pure (no I/O) — the web service does the DB aggregation and calls rankAndCount.
 */
export const ATTENTION_SEVERITY = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;
export type AttentionSeverity = (typeof ATTENTION_SEVERITY)[keyof typeof ATTENTION_SEVERITY];

export const ATTENTION_SOURCE_KIND = {
  APPROVAL: "approval",
  BUDGET_ALERT: "budget_alert",
  BLOCKER_ATTENTION: "blocker_attention",
  AGENT_ERROR_ALERT: "agent_error_alert",
} as const;
export type AttentionSourceKind =
  (typeof ATTENTION_SOURCE_KIND)[keyof typeof ATTENTION_SOURCE_KIND];

export interface AttentionItem {
  id: string;
  sourceKind: AttentionSourceKind;
  severity: AttentionSeverity;
  subjectKind: string;
  subjectId: string;
  title: string;
  whyNow: string;
  activityAt: string; // ISO
}
export interface AttentionFeed {
  totalCount: number;
  countsBySourceKind: Record<string, number>;
  items: AttentionItem[];
}

const SEVERITY_ORDER: Record<AttentionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Pure: lower rank = more urgent. Unknown severities sort last. */
export function severityRank(sev: string): number {
  return SEVERITY_ORDER[sev as AttentionSeverity] ?? 99;
}

/** Pure: sort items (severity, then recency desc) + compute totals/counts. */
export function rankAndCount(items: AttentionItem[]): AttentionFeed {
  const sorted = [...items].sort((a, b) => {
    const s = severityRank(a.severity) - severityRank(b.severity);
    if (s !== 0) return s;
    return b.activityAt.localeCompare(a.activityAt);
  });
  const countsBySourceKind: Record<string, number> = {};
  for (const it of sorted) {
    countsBySourceKind[it.sourceKind] = (countsBySourceKind[it.sourceKind] ?? 0) + 1;
  }
  return { totalCount: sorted.length, countsBySourceKind, items: sorted };
}
