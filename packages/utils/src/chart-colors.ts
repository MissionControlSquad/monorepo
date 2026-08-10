/**
 * Shared color constants for analytics charts.
 * Centralizes hex values so they stay in sync across all chart components.
 */

export const STATUS_COLORS: Record<string, string> = {
  backlog: "#64748b",
  inbox: "#9ca3af",
  assigned: "#3b82f6",
  in_progress: "#eab308",
  inProgress: "#eab308",
  review: "#a855f7",
  done: "#22c55e",
  blocked: "#ef4444",
};

export const CHART_THEME = {
  grid: "#f3f4f6",
  tickLight: "#9ca3af",
  tickDark: "#6b7280",
  completion: "#22c55e",
  activity: "#6366f1",
} as const;
