// ─── Roles ───────────────────────────────────────────────
export const Roles = {
  SQUAD_LEAD: "Squad Lead",
} as const;

// ─── Task Statuses ───────────────────────────────────────
export const TaskStatus = {
  INBOX: "inbox",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  REVIEW: "review",
  DONE: "done",
  BLOCKED: "blocked",
} as const;

export type TaskStatusValue = (typeof TaskStatus)[keyof typeof TaskStatus];

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
} as const;

export type EventTypeValue = (typeof EventTypes)[keyof typeof EventTypes];
