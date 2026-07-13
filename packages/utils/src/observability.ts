/**
 * Observability summary — shared pure bucketers (Epic #13). Shared across all apps. Import from
 * @agentcenter/utils. The web service runs the DB group-by queries and calls these to shape the result.
 */
export interface AgentSummary {
  total: number;
  operational: number; // idle + active
  blocked: number;
  idle: number;
  active: number;
}
export interface TaskSummary {
  total: number;
  open: number; // all non-done
  inProgress: number;
  review: number;
  blocked: number;
  done: number;
}

type Count = { status: string; _count: { _all: number } };

/** Pure: bucket agent status group-counts. Unknown statuses contribute to `total` only. */
export function bucketAgentCounts(rows: Count[]): AgentSummary {
  const s: AgentSummary = { total: 0, operational: 0, blocked: 0, idle: 0, active: 0 };
  for (const row of rows) {
    const n = row._count._all;
    s.total += n;
    if (row.status === "idle") {
      s.idle += n;
      s.operational += n;
    } else if (row.status === "active") {
      s.active += n;
      s.operational += n;
    } else if (row.status === "blocked") {
      s.blocked += n;
    }
  }
  return s;
}

/** Pure: bucket task status group-counts. `open` = every non-done task (superset of the splits). */
export function bucketTaskCounts(rows: Count[]): TaskSummary {
  const s: TaskSummary = { total: 0, open: 0, inProgress: 0, review: 0, blocked: 0, done: 0 };
  for (const row of rows) {
    const n = row._count._all;
    s.total += n;
    if (row.status === "done") {
      s.done += n;
    } else {
      s.open += n;
      if (row.status === "in_progress") s.inProgress += n;
      else if (row.status === "review") s.review += n;
      else if (row.status === "blocked") s.blocked += n;
    }
  }
  return s;
}

/** Pure: first instant of `date`'s UTC month. */
export function getUtcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}
