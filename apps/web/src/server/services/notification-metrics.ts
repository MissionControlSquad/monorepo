/** In-memory notification counters for observability. */

const counters = {
  created: 0,
  sent: 0,
  failed: 0,
  retried: 0,
  retriedSuccess: 0,
  deduped: 0,
  rateLimited: 0,
  quietDeferred: 0,
  deadLettered: 0,
};

export type MetricKey = keyof typeof counters;

export function incrementCounter(key: MetricKey, n = 1): void {
  counters[key] += n;
}

export function getMetrics(): Readonly<typeof counters> {
  return { ...counters };
}

export function resetMetrics(): void {
  for (const key of Object.keys(counters) as MetricKey[]) {
    counters[key] = 0;
  }
}
