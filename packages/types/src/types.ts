/**
 * Shared domain types matching GraphQL query shapes.
 *
 * These are "client-side" types that reflect what the frontend actually
 * receives from queries — NOT the full Prisma models.
 */

// ── Enums ──────────────────────────────────────────────────────

export type AgentStatus = "idle" | "active" | "blocked";

export type DetailedStatus =
  | "thinking"
  | "coding"
  | "reviewing"
  | "researching"
  | "deploying"
  | "testing"
  | "writing"
  | "waiting_review"
  | "waiting_input"
  | "waiting_dependency";

export type TaskStatus = "inbox" | "assigned" | "in_progress" | "review" | "done" | "blocked";

export type Priority = "low" | "medium" | "high" | "urgent";

export type DeliverableKind = "markdown" | "code" | "file" | "link";

export type ChannelVisibility = "public" | "private" | "dm";

export type ProfileKind = "human" | "agent";

export type SetupStatus = "pending_setup" | "active" | "deactivated";

export type AgentLevel = "intern" | "specialist" | "lead";

export type QueueItemStatus = "pending" | "in_progress" | "completed" | "blocked" | "skipped";

export type QueueItemType =
  | "task_breakdown"
  | "personal_note"
  | "reminder"
  | "follow_up"
  | "research"
  | "action";

export type ActivityType =
  | "task_created"
  | "task_updated"
  | "message_sent"
  | "document_created"
  | "agent_status_changed"
  | "task_assigned"
  | "task_completed"
  | "agent_woke_up"
  | "agent_went_to_sleep"
  | "deliverable_submitted";

// ── Nested / shared fragments ──────────────────────────────────

/** Minimal profile fields (used as nested object in many queries). */
export interface ProfileRef {
  id: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
}

/** Profile with kind field (channels, mentions). */
export interface ProfileWithKind extends ProfileRef {
  kind: ProfileKind;
}

/** Profile with agent relation (used in task assignees, project members). */
export interface ProfileWithAgent extends ProfileRef {
  kind?: ProfileKind;
  agentId?: string | null;
  agent?: {
    id: string;
    name: string;
    identityEmoji?: string | null;
    lastHeartbeat?: string | null;
    status?: AgentStatus;
    detailedStatus?: DetailedStatus | null;
    currentTaskId?: string | null;
    role?: string | null;
  } | null;
}

/** Profile with user account (used in "me" queries). */
export interface ProfileWithUser extends ProfileRef {
  user: { id: string; email: string } | null;
}

/** Profile with kind + agent (channel members). */
export interface ChannelProfileRef extends ProfileWithKind {
  agent?: {
    id: string;
    role?: string | null;
    identityEmoji?: string | null;
    status?: AgentStatus;
    currentTask?: string | null;
  } | null;
}

/** Minimal task reference (used in nested relations). */
export interface TaskRef {
  id: string;
  title: string;
  taskNumber?: number | null;
  status?: TaskStatus;
}

/** Minimal agent reference (used in nested relations). */
export interface AgentRef {
  id: string;
  name: string;
  identityEmoji?: string | null;
}

// ── Agent ──────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  detailedStatus?: DetailedStatus | null;
  statusMessage?: string | null;
  currentTaskId?: string | null;
  currentTask?: string | null;
  avatar?: string | null;
  identityEmoji?: string | null;
  level?: AgentLevel | null;
  username?: string | null;
  lastHeartbeat?: string | null;
  setupStatus: SetupStatus;
  isOnVacation?: boolean;
  apiKeyPrefix?: string | null;
  configVersion?: number | null;
  currentConfigVersion?: number | null;
  upgradeAvailable?: boolean;
  hostingType?: string | null;
  cloudVmId?: string | null;
  personality?: string | null;
  workspacePath?: string | null;
  /** Search result alias — some GraphQL queries return `_id` instead of `id`. */
  _id?: string;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  profile?: ProfileRef | null;
}

// ── Task ───────────────────────────────────────────────────────

export interface TaskAssignee {
  id: string;
  profileId: string;
  assignedAt?: string;
  profile?: ProfileWithAgent | null;
}

/** Task as returned by card/list queries (no description). */
export interface TaskCard {
  id: string;
  title: string;
  status: TaskStatus;
  priority?: Priority | null;
  createdAt?: string;
  updatedAt?: string;
  dueDate?: string | null;
  tags?: string[] | null;
  taskNumber?: number;
  parentTaskId?: string | null;
  projectId?: string | null;
  blockedByTaskId?: string | null;
  assignees?: TaskAssignee[];
}

/** Task with description (list queries). */
export interface TaskListItem extends TaskCard {
  description?: string | null;
  createdByProfileId?: string | null;
}

/** Full task detail (single task view). */
export interface TaskDetail extends TaskListItem {
  createdByProfile?: ProfileRef | null;
  parentTask?: TaskRef | null;
  blockedByTask?: TaskRef | null;
  project?: { id: string; name: string } | null;
}

// ── Project ────────────────────────────────────────────────────

export interface ProjectMember {
  id: string;
  projectId: string;
  profileId: string;
  joinedAt?: string;
  profile?: ProfileWithAgent | null;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  status?: "active" | "archived";
  shutdownActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  members?: ProjectMember[];
}

// ── Channel ────────────────────────────────────────────────────

export interface ChannelMember {
  id: string;
  profileId: string;
  role?: string;
  joinedAt?: string;
  lastReadAt?: string | null;
  profile?: ChannelProfileRef | null;
}

export interface Channel {
  id: string;
  name?: string | null;
  slug?: string | null;
  visibility: ChannelVisibility;
  description?: string | null;
  projectId?: string | null;
  createdByProfileId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  createdByProfile?: ProfileWithKind | null;
  project?: { id: string; name: string } | null;
  members?: ChannelMember[];
  unreadCount?: number;
}

// ── Messages ───────────────────────────────────────────────────

export interface MessageAttachment {
  id: string;
  messageId: string;
  documentId: string;
  document?: {
    id: string;
    title?: string | null;
    type?: string;
    storageKey?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    fileSize?: number | null;
  } | null;
}

export interface MessageMention {
  id: string;
  messageId?: string;
  profileId: string;
  profile?: ProfileRef | null;
}

export interface MessageReaction {
  id: string;
  messageId: string;
  profileId: string;
  emoji: string;
  profile?: ProfileRef | null;
}

/** Channel message (full fields). */
export interface ChannelMessage {
  id: string;
  channelId: string;
  fromProfileId: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
  pinnedAt?: string | null;
  pinnedByProfileId?: string | null;
  pinnedByProfile?: ProfileRef | null;
  fromProfile?: ProfileWithKind | null;
  attachments?: MessageAttachment[];
  mentions?: MessageMention[];
  reactions?: MessageReaction[];
}

/** Task message (comments). */
export interface TaskMessage {
  id: string;
  taskId: string;
  fromProfileId: string;
  content: string;
  projectId?: string | null;
  createdAt: string;
  fromProfile?: ProfileRef | null;
  task?: TaskRef | null;
  attachments?: { id: string; messageId: string; documentId?: string | null }[];
  mentions?: MessageMention[];
  reactions?: MessageReaction[];
}

// ── Deliverable ────────────────────────────────────────────────

export interface Deliverable {
  id: string;
  taskId: string;
  profileId?: string | null;
  projectId?: string | null;
  title: string;
  kind: DeliverableKind;
  content?: string | null;
  language?: string | null;
  storageKey?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  url?: string | null;
  version?: number;
  createdAt?: string;
  profile?: ProfileRef | null;
  task?: TaskRef | null;
}

export interface DeliverableVersion {
  id: string;
  deliverableId: string;
  version: number;
  title: string;
  kind: DeliverableKind;
  content?: string | null;
  language?: string | null;
  storageKey?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  url?: string | null;
  editedByProfileId?: string | null;
  createdAt?: string;
  editedByProfile?: ProfileRef | null;
}

// ── Activity ───────────────────────────────────────────────────

export interface Activity {
  id: string;
  type: ActivityType;
  profileId?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  profile?: (ProfileRef & { agentId?: string | null }) | null;
  task?: TaskRef | null;
}

// ── Agent Action ───────────────────────────────────────────────

export interface AgentAction {
  id: string;
  agentId: string;
  taskId?: string | null;
  projectId?: string | null;
  actionType: string;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
  timestamp: string;
  agent?: AgentRef | null;
  task?: TaskRef | null;
}

// ── Agent Queue ────────────────────────────────────────────────

export interface AgentQueueItem {
  id: string;
  agentId: string;
  title: string;
  description?: string | null;
  notes?: string | null;
  status: QueueItemStatus;
  priority: Priority;
  relatedTaskId?: string | null;
  projectId?: string | null;
  parentQueueItemId?: string | null;
  itemType: QueueItemType;
  autoGenerated?: boolean;
  generatedFrom?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  dueDate?: string | null;
  order?: number | null;
  relatedTask?: TaskRef | null;
  agent?: AgentRef | null;
}

// ── Status History ─────────────────────────────────────────────

export interface StatusHistoryEntry {
  id: string;
  agentId: string;
  fromStatus: AgentStatus;
  toStatus: AgentStatus;
  fromDetailedStatus?: DetailedStatus | null;
  toDetailedStatus?: DetailedStatus | null;
  statusMessage?: string | null;
  timestamp: string;
  agent?: AgentRef | null;
}

// ── Analytics ──────────────────────────────────────────────────

export interface TrendPoint {
  date: string;
  count: number;
}

export interface AgentWorkloadEntry {
  agentId: string;
  agentName: string;
  inbox: number;
  assigned: number;
  inProgress: number;
  review: number;
  done: number;
  blocked: number;
}

// ── Task Template ──────────────────────────────────────────────

export interface TaskTemplate {
  id: string;
  name: string;
  description?: string | null;
  subtasks?: unknown;
  createdAt?: string;
  updatedAt?: string;
}

// ── Work Summary ───────────────────────────────────────────────

export interface WorkSummary {
  totalWorkTimeMs: number;
  agentBreakdown?: { agentId: string; agentName: string; totalMs: number }[];
  activeSessionCount?: number;
  activeSessions?: { startedAt: string }[];
}

// ── Feature Flags ──────────────────────────────────────────────

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  managedBy: "system" | "user";
  description: string | null;
}

// ── Notifications ──────────────────────────────────────────────

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}
