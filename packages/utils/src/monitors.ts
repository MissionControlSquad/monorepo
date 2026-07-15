/**
 * Pure helpers for Tier C monitors. The metric/comparator vocabularies + the pure breach test. The
 * metric COMPUTATION (counting rows) lives server-side; the comparison is pure and lives here so it
 * is unit-testable and shared.
 */
export const MONITOR_METRICS = [
  "open_budget_incidents",
  "open_pipeline_cases",
  "active_agents",
  "disabled_secrets",
] as const;
export type MonitorMetric = (typeof MONITOR_METRICS)[number];

export const MONITOR_COMPARATORS = ["gt", "gte", "lt", "lte"] as const;
export type MonitorComparator = (typeof MONITOR_COMPARATORS)[number];

export function isMonitorMetric(v: string): v is MonitorMetric {
  return (MONITOR_METRICS as readonly string[]).includes(v);
}
export function isMonitorComparator(v: string): v is MonitorComparator {
  return (MONITOR_COMPARATORS as readonly string[]).includes(v);
}

/** Pure: is `value` in breach of `threshold` under `comparator`? */
export function isBreached(
  value: number,
  comparator: MonitorComparator,
  threshold: number,
): boolean {
  switch (comparator) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
  }
}

/** Human-readable label for a metric. */
export function monitorMetricLabel(metric: MonitorMetric): string {
  switch (metric) {
    case "open_budget_incidents":
      return "Open budget incidents";
    case "open_pipeline_cases":
      return "Open pipeline cases";
    case "active_agents":
      return "Active agents";
    case "disabled_secrets":
      return "Disabled secrets";
  }
}
