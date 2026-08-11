/**
 * buildbase HUMAN / workspace PLAN quota slugs (Epic #1, human-tenancy plane).
 *
 * These identify the customer's plan limits ("your plan allows N agents / projects / workspaces")
 * enforced through buildbase `usage.record` / `useQuotaUsageStatus`. They are the SaaS-plane, human
 * plan quotas — DELIBERATELY SEPARATE from the AI-agent LLM/run budgets governed by
 * `finance.prisma` (BudgetPolicy / QuotaWindow). Do not conflate the two.
 *
 * ACTIVATION: enforcement only takes effect once the org's buildbase plans define matching quota
 * slugs. Until a plan declares e.g. an `agents` quota, `useQuotaUsageStatus`/`useAllQuotaUsage`
 * return no data and the UI degrades gracefully to "unlimited" (no gating, current behavior).
 *
 * Pure constants only — no React, no server imports — so both the client components and the server
 * recording helper can import from here.
 */

export const USAGE_QUOTA_SLUGS = {
  agents: "agents",
  projects: "projects",
  workspaces: "workspaces",
} as const;

export type UsageQuotaSlug = (typeof USAGE_QUOTA_SLUGS)[keyof typeof USAGE_QUOTA_SLUGS];

export interface QuotaMeta {
  /** Human label for the quota. */
  label: string;
  /** Plural noun for "N/M <unit>" indicators. */
  unit: string;
  /** Short explanation shown in a tooltip. */
  description: string;
}

/**
 * Presentation metadata for the plan quotas AgentCenter records. Keyed by slug. Unknown slugs the
 * plan happens to expose still render (see `metaForSlug`) with a humanized fallback label.
 */
export const QUOTA_META: Record<string, QuotaMeta> = {
  [USAGE_QUOTA_SLUGS.agents]: {
    label: "Agents",
    unit: "agents",
    description:
      "AI agents you've created in this workspace. Your plan includes a set number; going over may incur overage or be blocked, depending on your plan.",
  },
  [USAGE_QUOTA_SLUGS.projects]: {
    label: "Projects",
    unit: "projects",
    description:
      "Active projects grouping tasks and members. Counts against your workspace plan's included projects.",
  },
  [USAGE_QUOTA_SLUGS.workspaces]: {
    label: "Workspaces",
    unit: "workspaces",
    description: "Workspaces on your account. Counts against your plan's included workspaces.",
  },
};

/** Humanize an arbitrary slug (e.g. `api_calls` → `Api Calls`) for quotas without explicit meta. */
export function metaForSlug(slug: string): QuotaMeta {
  const known = QUOTA_META[slug];
  if (known) return known;
  const label = slug
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  return {
    label: label || slug,
    unit: slug,
    description: `Usage of your plan's "${slug}" quota.`,
  };
}
