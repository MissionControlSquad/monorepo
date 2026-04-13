import type { SetupMode } from "./agent-creation";
import { AgentLevel, Priority, TaskStatus } from "./domain-constants";

// ── Agent defaults ─────────────────────────────────────────────────────────────

export const DEFAULT_AGENT_LEVEL = AgentLevel.SPECIALIST;
export const DEFAULT_AGENT_EMOJI = "🤖";
export const DEFAULT_SETUP_MODE: SetupMode = "auto";
export const SQUAD_LEAD_ROLE = "Squad Lead";

// ── Task defaults ──────────────────────────────────────────────────────────────

export const DEFAULT_TASK_PRIORITY = Priority.MEDIUM;
export const DEFAULT_TASK_STATUS = TaskStatus.INBOX;

// ── Color fallbacks ────────────────────────────────────────────────────────────

/** Default gray used as a fallback when no status/priority color is found */
export const DEFAULT_COLOR = "#6b7280";

// ── Activity type hex colors ───────────────────────────────────────────────────

export const ACTIVITY_TYPE_HEX_COLORS: Record<string, string> = {
  task_created: "#2563eb",
  task_updated: "#d97706",
  task_completed: "#16a34a",
  task_rejected: "#dc2626",
  task_approved: "#16a34a",
  task_assigned: "#7c3aed",
  task_unassigned: "#6b7280",
  agent_status_changed: "#0891b2",
  message_sent: "#6b7280",
  deliverable_created: "#2563eb",
  project_created: "#d97706",
  project_updated: "#6b7280",
};

// ── Notification type hex colors ──────────────────────────────────────────────

export const NOTIFICATION_TYPE_HEX_COLORS: Record<string, string> = {
  task_done: "#16a34a",
  task_needs_review: "#d97706",
  task_clarification_requested: "#2563eb",
  task_approved: "#16a34a",
  task_rejected: "#dc2626",
  new_comment: "#6b7280",
  mention: "#2563eb",
  deliverable_submitted: "#7c3aed",
  task_assigned: "#2563eb",
};

// ── Pagination page sizes ──────────────────────────────────────────────────────

export const PAGE_SIZE_DEFAULT = 30;
export const PAGE_SIZE_KANBAN = 50;
export const PAGE_SIZE_CHANNELS = 50;
export const PAGE_SIZE_NOTIFICATIONS = 50;

// ── Polling intervals ──────────────────────────────────────────────────────────

export const NOTIFICATION_POLL_INTERVAL_MS = 30_000;
export const AGENT_STATUS_UPDATE_INTERVAL_MS = 15_000;
