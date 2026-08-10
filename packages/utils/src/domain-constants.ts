/**
 * Domain constants shared across all apps (web, mobile, desktop).
 * Import from @agentcenter/utils — do NOT duplicate these as string literals.
 */

// ─── Roles ───────────────────────────────────────────────
export const Roles = {
  SQUAD_LEAD: "Squad Lead",
} as const;

export type RoleValue = (typeof Roles)[keyof typeof Roles];

// ─── Task Statuses ───────────────────────────────────────
export const TaskStatus = {
  BACKLOG: "backlog",
  INBOX: "inbox",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  REVIEW: "review",
  DONE: "done",
  BLOCKED: "blocked",
  CANCELLED: "cancelled",
} as const;

export type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus];

/** Parity §3.12 — how an agent should approach a task. Mirrors the Prisma `WorkMode` enum. */
export const WorkMode = {
  STANDARD: "standard",
  ASK: "ask",
  PLANNING: "planning",
  SKILL_TEST: "skill_test",
} as const;

export type WorkModeValue = (typeof WorkMode)[keyof typeof WorkMode];

/** Human-readable labels + help text for each WorkMode (used by the create-task form select tooltip). */
export const WORK_MODE_META: Record<WorkModeValue, { label: string; help: string }> = {
  standard: { label: "Standard", help: "Execute the task normally." },
  ask: { label: "Ask", help: "Ask clarifying questions before taking action." },
  planning: { label: "Planning", help: "Produce a plan only — don't execute it yet." },
  skill_test: { label: "Skill test", help: "A sandboxed trial run to exercise a skill." },
};

// ─── Priorities ──────────────────────────────────────────
export const Priority = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  URGENT: "urgent",
} as const;

export type PriorityValue = (typeof Priority)[keyof typeof Priority];

// ─── Agent Setup Statuses ────────────────────────────────
export const SetupStatus = {
  PENDING_SETUP: "pending_setup",
  ACTIVE: "active",
  DEACTIVATED: "deactivated",
} as const;

export type SetupStatusValue = (typeof SetupStatus)[keyof typeof SetupStatus];

// ─── Profile Kinds ───────────────────────────────────────
export const ProfileKind = {
  AGENT: "agent",
  HUMAN: "human",
} as const;

export type ProfileKindValue = (typeof ProfileKind)[keyof typeof ProfileKind];

// ─── Queue Item Statuses ─────────────────────────────────
export const QueueItemStatus = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  BLOCKED: "blocked",
  SKIPPED: "skipped",
} as const;

export type QueueItemStatusValue = (typeof QueueItemStatus)[keyof typeof QueueItemStatus];

// ─── Event Types ─────────────────────────────────────────
export const EventTypes = {
  // Agent
  AGENT_WOKE_UP: "agent.woke_up",
  AGENT_WENT_TO_SLEEP: "agent.went_to_sleep",
  AGENT_STATUS_CHANGED: "agent.status_changed",
  /** Emitted from central agent-status when a direct update changes status (for history/activity only; agentState does not listen) */
  AGENT_STATUS_APPLIED: "agent.status_applied",
  AGENT_JOINED: "agent.joined",
  /** Emitted by the wake-queue drainer when a coalesced agent wake is delivered (proactive wake substrate) */
  AGENT_WAKE_DELIVERED: "agent.wake_delivered",

  // Task
  TASK_CREATED: "task.created",
  TASK_STATUS_CHANGED: "task.status_changed",
  TASK_ASSIGNEES_CHANGED: "task.assignees_changed",
  TASK_FIELDS_UPDATED: "task.fields_updated",
  TASK_DELETED: "task.deleted",
  TASK_APPROVED: "task.approved",
  TASK_REJECTED: "task.rejected",
  TASK_CLARIFICATION_REQUESTED: "task.clarification_requested",

  // Collaboration
  MESSAGE_CREATED: "message.created",
  DOCUMENT_CREATED: "document.created",

  // Queue
  QUEUE_ITEM_CREATED: "queue.item_created",
  QUEUE_ITEM_STATUS_CHANGED: "queue.item_status_changed",

  // Deliverable
  DELIVERABLE_SUBMITTED: "deliverable.submitted",

  // Project
  PROJECT_CREATED: "project.created",
  PROJECT_MEMBER_ADDED: "project.member_added",
  PROJECT_MEMBER_REMOVED: "project.member_removed",

  // Budgets / cost (Epic #4)
  COST_EVENT_RECORDED: "cost.event_recorded",
  BUDGET_INCIDENT_OPENED: "budget.incident_opened",
  BUDGET_INCIDENT_RESOLVED: "budget.incident_resolved",
} as const;

export type EventTypeValue = (typeof EventTypes)[keyof typeof EventTypes];

// ─── Channel Visibility ──────────────────────────────────
export const ChannelVisibility = {
  PUBLIC: "public",
  PRIVATE: "private",
  DM: "dm",
} as const;

export type ChannelVisibilityValue = (typeof ChannelVisibility)[keyof typeof ChannelVisibility];

// ─── Project Statuses ────────────────────────────────────
export const ProjectStatus = {
  ACTIVE: "active",
  ARCHIVED: "archived",
  PAUSED: "paused",
} as const;

export type ProjectStatusValue = (typeof ProjectStatus)[keyof typeof ProjectStatus];

// ─── Notification Kinds ──────────────────────────────────
// Mirror of the Prisma UserNotificationType enum — values must stay in sync.
export const NotificationKind = {
  TASK_ASSIGNED: "task_assigned",
  TASK_DONE: "task_done",
  TASK_NEEDS_REVIEW: "task_needs_review",
  TASK_CLARIFICATION_REQUESTED: "task_clarification_requested",
  TASK_APPROVED: "task_approved",
  TASK_REJECTED: "task_rejected",
  NEW_COMMENT: "new_comment",
  MENTION: "mention",
  DELIVERABLE_SUBMITTED: "deliverable_submitted",
  TEAM_UPDATE: "team_update",
  DOCUMENT_ADDED: "document_added",
} as const;

export type NotificationKindValue = (typeof NotificationKind)[keyof typeof NotificationKind];

// ─── Channel Member Roles ────────────────────────────────
export const ChannelMemberRole = {
  CREATOR: "creator",
  MEMBER: "member",
} as const;

export type ChannelMemberRoleValue = (typeof ChannelMemberRole)[keyof typeof ChannelMemberRole];

// ─── Recurring Task Frequency ────────────────────────────
export const RecurringFrequency = {
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
} as const;

export type RecurringFrequencyValue = (typeof RecurringFrequency)[keyof typeof RecurringFrequency];

// ─── Queue Item Types ────────────────────────────────────
export const QueueItemType = {
  ACTION: "action",
  REMINDER: "reminder",
  NOTE: "note",
} as const;

export type QueueItemTypeValue = (typeof QueueItemType)[keyof typeof QueueItemType];

// ─── Agent Statuses ──────────────────────────────────────
export const AgentStatus = {
  IDLE: "idle",
  ACTIVE: "active",
  BLOCKED: "blocked",
} as const;

export type AgentStatusValue = (typeof AgentStatus)[keyof typeof AgentStatus];

// ─── Deliverable Kinds ────────────────────────────────────
export const DeliverableKind = {
  MARKDOWN: "markdown",
  CODE: "code",
  FILE: "file",
  LINK: "link",
} as const;

export const DELIVERABLE_KINDS = Object.values(DeliverableKind);
export type DeliverableKindValue = (typeof DeliverableKind)[keyof typeof DeliverableKind];

export function isDeliverableKind(v: string): v is DeliverableKindValue {
  return (DELIVERABLE_KINDS as readonly string[]).includes(v);
}

// ─── Project Member Statuses ──────────────────────────────
export const ProjectMemberStatus = {
  ACTIVE: "active",
  DEACTIVATED: "deactivated",
} as const;

export type ProjectMemberStatusValue = (typeof ProjectMemberStatus)[keyof typeof ProjectMemberStatus];

// ─── License Status Codes ─────────────────────────────────
export const LicenseStatusCode = {
  ACTIVE: "active",
  EXPIRED: "expired",
  INVALID: "invalid",
  REVOKED: "revoked",
  GRACE: "grace",
  NONE: "none",
} as const;

export type LicenseStatusCodeValue = (typeof LicenseStatusCode)[keyof typeof LicenseStatusCode];

// ─── Queue Item Generated From ────────────────────────────
export const QueueItemGeneratedFrom = {
  REVIEW_REJECTION: "review_rejection",
} as const;

export type QueueItemGeneratedFromValue = (typeof QueueItemGeneratedFrom)[keyof typeof QueueItemGeneratedFrom];

// ─── Agent Levels ─────────────────────────────────────────
export const AgentLevel = {
  JUNIOR: "junior",
  SPECIALIST: "specialist",
  SENIOR: "senior",
  LEAD: "lead",
} as const;

export type AgentLevelValue = (typeof AgentLevel)[keyof typeof AgentLevel];

// ─── Message Reaction Emojis ──────────────────────────────
export const MessageReactionEmoji = {
  THUMBS_UP: "thumbs-up",
  HEART: "heart",
  EYES: "eyes",
  CHECKMARK: "checkmark",
  PARTY: "party",
  THINK: "think",
} as const;

export type MessageReactionEmojiValue = (typeof MessageReactionEmoji)[keyof typeof MessageReactionEmoji];

// ─── Storage Prefixes ─────────────────────────────────────
export const StoragePrefix = {
  DELIVERABLES: "deliverables",
  ATTACHMENTS: "attachments",
  AVATARS: "avatars",
  ASSETS: "assets",
} as const;

export type StoragePrefixValue = (typeof StoragePrefix)[keyof typeof StoragePrefix];

// ─── Case States (Epic #17) ──────────────────────────────
export const CaseState = {
  DRAFT: "draft",
  IN_PROGRESS: "in_progress",
  IN_REVIEW: "in_review",
  APPROVED: "approved",
  DONE: "done",
  CANCELLED: "cancelled",
} as const;
export const CASE_STATES = Object.values(CaseState);
export type CaseStateValue = (typeof CASE_STATES)[number];

// ─── Budget Windows (Epic #4) ────────────────────────────
export const BudgetWindow = {
  HOURLY: "hourly",
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
} as const;
export const BUDGET_WINDOWS = Object.values(BudgetWindow);
export type BudgetWindowValue = (typeof BUDGET_WINDOWS)[number];

// ─── Budget Incident threshold + status (Epic #4) ────────
export const IncidentThreshold = { SOFT: "soft", HARD: "hard" } as const;
export type IncidentThresholdValue = (typeof IncidentThreshold)[keyof typeof IncidentThreshold];

export const IncidentStatus = { OPEN: "open", RESOLVED: "resolved" } as const;
export type IncidentStatusValue = (typeof IncidentStatus)[keyof typeof IncidentStatus];

// ─── Approvals (Epic #3) ─────────────────────────────────
export const ApprovalStatus = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  NEEDS_CHANGES: "needs_changes",
  CANCELLED: "cancelled",
} as const;
export type ApprovalStatusValue = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const ApprovalSubjectType = {
  TASK: "task",
  DELIVERABLE: "deliverable",
  HIRE_AGENT: "hire_agent",
  BUDGET_OVERRIDE: "budget_override",
} as const;
export type ApprovalSubjectTypeValue =
  (typeof ApprovalSubjectType)[keyof typeof ApprovalSubjectType];

// Secret lifecycle status (Epic #5). Only `active` secrets resolve into an agent's env.
export const SecretStatus = {
  ACTIVE: "active",
  DISABLED: "disabled",
  ARCHIVED: "archived",
} as const;
export const SECRET_STATUSES = Object.values(SecretStatus);
export type SecretStatusValue = (typeof SecretStatus)[keyof typeof SecretStatus];

export function isSecretStatus(v: string): v is SecretStatusValue {
  return (SECRET_STATUSES as readonly string[]).includes(v);
}

// Cost billing type (Epic #4). Splits metered API spend from flat subscription spend in reports.
export const CostBillingType = {
  API: "api",
  SUBSCRIPTION: "subscription",
} as const;
export const COST_BILLING_TYPES = Object.values(CostBillingType);
export type CostBillingTypeValue = (typeof CostBillingType)[keyof typeof CostBillingType];

export function isCostBillingType(v: string): v is CostBillingTypeValue {
  return (COST_BILLING_TYPES as readonly string[]).includes(v);
}
