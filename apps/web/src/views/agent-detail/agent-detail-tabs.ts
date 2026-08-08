// Pure helpers for the unified tabbed Agent Detail page (Paperclip parity: AgentDetail with URL-driven
// `?tab=` routing + `run=<id>` deep-linking). No React, no I/O - the tested core that AgentDetailPage
// binds to the URL. Mirrors Paperclip's `parseAgentDetailView` / run-detail selection, adapted to the
// monorepo's Next.js `useSearchParams` routing style.

export const AGENT_DETAIL_TABS = [
  "overview",
  "tasks",
  "deliverables",
  "activity",
  "runs",
  "tools",
  "settings",
] as const;

export type AgentDetailTab = (typeof AGENT_DETAIL_TABS)[number];

export const DEFAULT_AGENT_DETAIL_TAB: AgentDetailTab = "overview";

// A few forgiving aliases so old/short links still land on a real tab.
const TAB_ALIASES: Record<string, AgentDetailTab> = {
  run: "runs",
  deliverable: "deliverables",
  task: "tasks",
  tool: "tools",
  config: "settings",
  configuration: "settings",
  edit: "settings",
  dashboard: "overview",
};

/** Type guard: is `value` one of the known tabs. */
export function isAgentDetailTab(value: string | null | undefined): value is AgentDetailTab {
  return typeof value === "string" && (AGENT_DETAIL_TABS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` search-param value into a real tab. Unknown / empty values fall back to
 * {@link DEFAULT_AGENT_DETAIL_TAB}; a small alias table maps legacy names. Case-insensitive.
 */
export function resolveAgentDetailTab(raw: string | null | undefined): AgentDetailTab {
  if (!raw) return DEFAULT_AGENT_DETAIL_TAB;
  const value = raw.trim().toLowerCase();
  if (!value) return DEFAULT_AGENT_DETAIL_TAB;
  if (isAgentDetailTab(value)) return value;
  return TAB_ALIASES[value] ?? DEFAULT_AGENT_DETAIL_TAB;
}

export type RunDetailMode = "list" | "detail";

export interface RunDetailSelection<T> {
  /** `detail` when a run id is present, otherwise the run list. */
  mode: RunDetailMode;
  /** The requested run id (trimmed), or null when none was requested. */
  runId: string | null;
  /** The matched run object when it is available in `runs`, else null. */
  run: T | null;
  /** True when a run id was requested but no matching run is present (loading or not found). */
  notFound: boolean;
}

/**
 * Decide whether the Runs tab shows the list or a single run's detail, given the `?run=` param and the
 * currently-loaded runs. When a run id is requested but not present in `runs`, `mode` is still `detail`
 * (so the caller renders the detail shell / loading state) and `notFound` is true.
 */
export function selectRunDetail<T extends { id: string }>(
  runParam: string | null | undefined,
  runs: readonly T[] | null | undefined,
): RunDetailSelection<T> {
  const runId = runParam && runParam.trim() ? runParam.trim() : null;
  if (!runId) return { mode: "list", runId: null, run: null, notFound: false };
  const run = (runs ?? []).find((entry) => entry.id === runId) ?? null;
  return { mode: "detail", runId, run, notFound: run === null };
}

/**
 * Build the query-string for an agent-detail URL. Overview with no run collapses to a bare path (no
 * noisy `?tab=overview`); everything else carries `?tab=` and, on the runs tab, an optional `run=`.
 */
export function buildAgentDetailQuery(tab: AgentDetailTab, runId?: string | null): string {
  const params = new URLSearchParams();
  if (tab !== DEFAULT_AGENT_DETAIL_TAB) params.set("tab", tab);
  if (tab === "runs" && runId && runId.trim()) params.set("run", runId.trim());
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Full href for an agent-detail tab (base path `/agents/:id`), with optional run deep-link. */
export function buildAgentDetailHref(
  agentId: string,
  tab: AgentDetailTab,
  runId?: string | null,
): string {
  return `/agents/${agentId}${buildAgentDetailQuery(tab, runId)}`;
}
