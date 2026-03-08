import { EventTypes } from "../constants";

// Agent domain events
export type AgentWokeUpEvent = {
  type: typeof EventTypes.AGENT_WOKE_UP;
  agentId: string;
  agentName: string;
  currentTaskId?: string;
  currentTask?: string;
  detailedStatus?: string;
  previousStatus: "idle" | "active" | "blocked";
  previousDetailedStatus?: string;
};

export type AgentWentToSleepEvent = {
  type: typeof EventTypes.AGENT_WENT_TO_SLEEP;
  agentId: string;
  agentName: string;
  previousStatus: "idle" | "active" | "blocked";
  previousDetailedStatus?: string;
};

export type AgentStatusChangedEvent = {
  type: typeof EventTypes.AGENT_STATUS_CHANGED;
  agentId: string;
  agentName: string;
  fromStatus: "idle" | "active" | "blocked";
  toStatus: "idle" | "active" | "blocked";
  fromDetailedStatus?: string;
  toDetailedStatus?: string;
  statusMessage?: string;
  currentTaskId?: string;
  currentTask?: string;
};

/** Fired from central agent-status when a direct update changes status (history/activity only) */
export type AgentStatusAppliedEvent = {
  type: typeof EventTypes.AGENT_STATUS_APPLIED;
  agentId: string;
  agentName: string;
  fromStatus: "idle" | "active" | "blocked";
  toStatus: "idle" | "active" | "blocked";
  fromDetailedStatus?: string;
  toDetailedStatus?: string;
  statusMessage?: string;
};

export type AgentJoinedEvent = {
  type: typeof EventTypes.AGENT_JOINED;
  agentId: string;
  agentName: string;
};

// Task domain events
export type TaskCreatedEvent = {
  type: typeof EventTypes.TASK_CREATED;
  taskId: string;
  taskNumber?: number;
  title: string;
  createdBy?: string;
  creatorName?: string;
  /** Direct profile ID of the creator (used for human/dashboard tasks instead of agentId resolution) */
  profileId?: string;
  assigneeIds: string[];
  fromDashboard: boolean;
};

export type FieldChange = { field: string; from: unknown; to: unknown };

export type TaskStatusChangedEvent = {
  type: typeof EventTypes.TASK_STATUS_CHANGED;
  taskId: string;
  taskNumber?: number;
  title: string;
  fromStatus: string;
  toStatus: string;
  changedBy?: string;
  profileId?: string;
  changes?: FieldChange[];
};

export type TaskAssigneesChangedEvent = {
  type: typeof EventTypes.TASK_ASSIGNEES_CHANGED;
  taskId: string;
  taskNumber?: number;
  title: string;
  addedIds: string[];
  removedIds: string[];
  addedNames: string[];
  removedNames: string[];
  profileId?: string;
  changes?: FieldChange[];
};

export type TaskFieldsUpdatedEvent = {
  type: typeof EventTypes.TASK_FIELDS_UPDATED;
  taskId: string;
  taskNumber?: number;
  title: string;
  profileId?: string;
  changes?: FieldChange[];
};

export type TaskDeletedEvent = {
  type: typeof EventTypes.TASK_DELETED;
  taskId: string;
  taskNumber?: number;
  title: string;
  agentId: string;
  agentName: string;
  assigneeIds: string[];
  profileId?: string;
};

export type TaskApprovedEvent = {
  type: typeof EventTypes.TASK_APPROVED;
  taskId: string;
  taskNumber?: number;
  title: string;
  reviewerId: string;
  reviewerName: string;
  assigneeIds: string[];
  assigneeNames: string[];
  childTasks?: { taskId: string; taskNumber: number; title: string }[];
};

export type TaskRejectedEvent = {
  type: typeof EventTypes.TASK_REJECTED;
  taskId: string;
  taskNumber?: number;
  title: string;
  reviewerId: string;
  reviewerName: string;
  assigneeIds: string[];
  assigneeNames: string[];
  rejectionReason: string;
  changesNeeded: string[];
};

export type TaskClarificationRequestedEvent = {
  type: typeof EventTypes.TASK_CLARIFICATION_REQUESTED;
  taskId: string;
  taskNumber?: number;
  title: string;
  reviewerId: string;
  reviewerName: string;
  assigneeIds: string[];
  assigneeNames: string[];
  questions: string[];
};

// Collaboration domain events
export type MessageCreatedEvent = {
  type: typeof EventTypes.MESSAGE_CREATED;
  messageId: string;
  taskId: string;
  taskNumber?: number;
  taskTitle: string;
  fromProfileId: string;
  fromAgentId?: string;
  fromAgentName: string;
  content: string;
  mentionedAgentIds: string[];
  mentionedProfileIds?: string[];
};

export type DocumentCreatedEvent = {
  type: typeof EventTypes.DOCUMENT_CREATED;
  documentId: string;
  title: string;
  docType: string;
  taskId?: string;
  taskTitle?: string;
  createdBy: string;
  creatorName: string;
  profileId?: string;
};

// Queue domain events
export type QueueItemCreatedEvent = {
  type: typeof EventTypes.QUEUE_ITEM_CREATED;
  queueItemId: string;
  agentId: string;
  agentName: string;
  title: string;
  relatedTaskId?: string;
};

export type QueueItemStatusChangedEvent = {
  type: typeof EventTypes.QUEUE_ITEM_STATUS_CHANGED;
  queueItemId: string;
  agentId: string;
  agentName: string;
  title: string;
  newStatus: string;
  relatedTaskId?: string;
};

// Deliverable domain events
export type DeliverableSubmittedEvent = {
  type: typeof EventTypes.DELIVERABLE_SUBMITTED;
  deliverableId: string;
  taskId: string;
  taskNumber?: number;
  taskTitle: string;
  profileId: string;
  agentId?: string;
  agentName: string;
  title: string;
  kind: string;
  version?: number;
  isRevision?: boolean;
};

// Project domain events
export type ProjectCreatedEvent = {
  type: typeof EventTypes.PROJECT_CREATED;
  projectId: string;
  name: string;
  memberIds: string[];
};

export type ProjectMemberAddedEvent = {
  type: typeof EventTypes.PROJECT_MEMBER_ADDED;
  projectId: string;
  projectName: string;
  agentId: string;
  agentName: string;
  agentRole?: string;
  agentLevel?: string;
  agentEmoji?: string;
  agentUsername?: string;
  agentPersonality?: string;
};

export type ProjectMemberRemovedEvent = {
  type: typeof EventTypes.PROJECT_MEMBER_REMOVED;
  projectId: string;
  projectName: string;
  agentId: string;
  agentName: string;
};

// Discriminated union of all events
export type SystemEvent =
  | AgentWokeUpEvent
  | AgentWentToSleepEvent
  | AgentStatusChangedEvent
  | AgentStatusAppliedEvent
  | AgentJoinedEvent
  | TaskCreatedEvent
  | TaskStatusChangedEvent
  | TaskAssigneesChangedEvent
  | TaskFieldsUpdatedEvent
  | TaskDeletedEvent
  | TaskApprovedEvent
  | TaskRejectedEvent
  | TaskClarificationRequestedEvent
  | MessageCreatedEvent
  | DocumentCreatedEvent
  | QueueItemCreatedEvent
  | QueueItemStatusChangedEvent
  | DeliverableSubmittedEvent
  | ProjectCreatedEvent
  | ProjectMemberAddedEvent
  | ProjectMemberRemovedEvent;

export type EventType = SystemEvent["type"];
