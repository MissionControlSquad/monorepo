/**
 * Platform-agnostic formatting utilities shared across web, mobile, and Electron.
 */

/** "just now", "5m ago", "2h ago", "3d ago", else "Jan 1" */
export function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Jan 1, 2024" — returns "—" for null/undefined */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** "Jan 1, 2024, 2:30 PM" */
export function formatDateWithTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Chat/message timestamp: shows "2:30 PM" for today, "Jan 1" for older.
 * Useful for channel/message lists.
 */
export function formatChatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "5m", "2h 30m", "1d 3h" — for server/VM uptime displays */
export function formatUptime(seconds: number): string {
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}

/** "$12.34" — formats integer cents as USD */
export function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** "512 B", "1.5 KB", "2.3 MB" — returns "" for null/zero */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Strips common Markdown syntax from a string, leaving plain text.
 * Useful for generating preview snippets from markdown content.
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/^>\s+/gm, "")
    .replace(/\n{2,}/g, " ")
    .trim();
}

/**
 * "in_progress" → "In Progress", "squad_lead" → "Squad Lead"
 * Replaces underscores with spaces and title-cases each word.
 */
export function humanizeLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * "Due today", "Due tomorrow", "Due in 3d", "1d overdue"
 * Useful for task due-date badges.
 */
export function formatDueDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days}d`;
}

/**
 * Generate up-to-2-character initials from a display name.
 * "Alice Bob" → "AB", "Alice" → "A", "" → "?"
 */
export function generateInitials(displayName: string): string {
  return (
    displayName
      .split(" ")
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

/** Due date filter values shared across web and mobile. */
export type DueDateFilter = "" | "overdue" | "today" | "this_week" | "no_due_date";

/**
 * Returns true if the given due date matches the filter.
 * Pass `""` or `null`/`undefined` to disable filtering (always returns true).
 */
export function matchesDueDateFilter(
  dueDate: string | null | undefined,
  filter: DueDateFilter | null | undefined,
): boolean {
  if (!filter) return true;
  if (filter === "no_due_date") return !dueDate;
  if (!dueDate) return false;

  const now = new Date();
  const due = new Date(dueDate);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 86400000 - 1);

  switch (filter) {
    case "overdue":
      return due < startOfToday;
    case "today":
      return due >= startOfToday && due <= endOfToday;
    case "this_week": {
      const dayOfWeek = now.getDay();
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
      const endOfWeek = new Date(startOfWeek.getTime() + 7 * 86400000 - 1);
      return due >= startOfWeek && due <= endOfWeek;
    }
    default:
      return true;
  }
}
