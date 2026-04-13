/**
 * Shared API error message constants.
 * Centralises repeated string literals so typos are caught at compile time
 * and copy is consistent across all route handlers.
 *
 * Usage:
 *   import { ERR } from "../../_lib/error-messages";
 *   return errorResponse(ERR.TASK_NOT_FOUND, 404);
 */
export const ERR = {
  // 404 — entity not found
  AGENT_NOT_FOUND: "Agent not found",
  TASK_NOT_FOUND: "Task not found",
  VM_NOT_FOUND: "VM not found",
  DOC_NOT_FOUND: "Doc not found",
  PROJECT_NOT_FOUND: "Project not found",
  QUEUE_ITEM_NOT_FOUND: "Queue item not found",
  RECURRING_TASK_NOT_FOUND: "Recurring task not found",
  DELIVERABLE_NOT_FOUND: "Deliverable not found",
  CONNECTION_NOT_FOUND: "Connection not found",
  MESSAGE_NOT_FOUND: "Message not found",
  NOTIFICATION_NOT_FOUND: "Notification not found",
  PROFILE_NOT_FOUND: "Profile not found",
  SKILL_GUIDE_NOT_FOUND: "Skill guide not found",

  // 400 — invalid state
  VM_NOT_RUNNING: "VM is not running",

  // 403 — access / ownership
  NOT_CHANNEL_MEMBER: "Not a member of this channel",
  NOT_YOUR_QUEUE_ITEM: "Not your queue item",
  NOT_YOUR_DELIVERABLE: "Not your deliverable",
} as const;
