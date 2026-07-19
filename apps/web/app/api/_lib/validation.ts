import { z } from "zod/v4";
import { errorResponse } from "./json-response";
import {
  AgentLevel,
  Priority,
  TaskStatus,
  QueueItemStatus,
  MessageReactionEmoji,
  StoragePrefix,
  DeliverableKind,
} from "@/server/constants";

/**
 * Parse and validate a request body against a Zod schema.
 * Returns { data } on success or { error: NextResponse } on failure.
 */
export async function validateBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T>; error?: never } | { data?: never; error: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: errorResponse("Invalid JSON body", 400) };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    const messages = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    return { error: errorResponse(messages.join("; "), 400) };
  }

  return { data: result.data };
}

// ─── Shared field schemas ──────────────────────────────────────────

const str = (max = 500) => z.string().min(1).max(max);
const optStr = (max = 500) => z.string().max(max).optional();
const idStr = () => z.string().min(1).max(100);
const idArray = () => z.array(idStr()).optional();
const tags = () => z.array(z.string().max(50)).max(20).optional();

// ─── Route-specific schemas ────────────────────────────────────────

export const createAgentSchema = z.object({
  name: str(100),
  role: str(100),
  username: z
    .string()
    .min(2)
    .max(40)
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username must contain only letters, numbers, hyphens, and underscores",
    )
    .optional(),
  identityEmoji: optStr(10),
  personality: optStr(2000),
  level: z.enum(Object.values(AgentLevel) as [string, ...string[]]).optional(),
  templateId: optStr(100),
  workspacePath: optStr(500),
});

export const batchCreateAgentSchema = z.object({
  agents: z.array(createAgentSchema).min(1).max(20),
});

export const createTaskSchema = z.object({
  title: str(500),
  description: str(10000),
  assigneeIds: idArray(),
  priority: z.enum(Object.values(Priority) as [string, ...string[]]).optional(),
  dueDate: z.string().optional(),
  tags: tags(),
  parentTaskId: idStr().optional(),
  projectId: idStr().optional(),
  blockedByTaskId: idStr().optional(),
});

export const createRecurringTaskSchema = z.object({
  title: str(500),
  description: str(10000),
  recurrenceConfig: z.record(z.string(), z.unknown()),
  assigneeIds: idArray(),
  priority: z.enum(Object.values(Priority) as [string, ...string[]]).optional(),
  tags: tags(),
  projectId: idStr().optional(),
  status: z.string().max(50).optional(),
  timezone: z.string().max(50).optional(),
});

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required").max(100),
  password: z.string().min(1, "Password is required").max(200),
});

// ─── Task update (PATCH /api/tasks/[id]) ──────────────────────────
export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  status: z.enum(Object.values(TaskStatus) as [string, ...string[]]).optional(),
  priority: z.enum(Object.values(Priority) as [string, ...string[]]).optional(),
  dueDate: z.string().max(100).nullable().optional(),
  tags: tags().nullable(),
  parentTaskId: idStr().nullable().optional(),
  blockedByTaskId: idStr().nullable().optional(),
  assigneeIds: z.array(idStr()).optional(),
});

// ─── Task messages (POST /api/tasks/[id]/messages & /api/messages) ─
export const createMessageSchema = z.object({
  taskId: idStr().optional(), // required in /api/messages, derived from params in /api/tasks/[id]/messages
  content: z.string().min(1, "Content is required").max(50000),
  attachmentIds: z.array(idStr()).max(20).optional(),
});

// ─── Deliverable (POST /api/tasks/[id]/deliverables) ──────────────
export const createDeliverableSchema = z.object({
  title: str(500),
  kind: z.enum(Object.values(DeliverableKind) as [string, ...string[]]),
  content: z.string().max(500000).optional(),
  language: z.string().max(50).optional(),
  storageKey: z.string().max(500).optional(),
  fileName: z.string().max(300).optional(),
  mimeType: z.string().max(200).optional(),
  fileSize: z.number().int().min(0).optional(),
  url: z.string().max(2000).optional(),
});

// ─── Deliverable update (PATCH /api/tasks/[id]/deliverables/[deliverableId]) ─
export const updateDeliverableSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().max(500000).optional(),
  language: z.string().max(50).optional(),
  storageKey: z.string().max(500).optional(),
  fileName: z.string().max(300).optional(),
  mimeType: z.string().max(200).optional(),
  fileSize: z.number().int().min(0).optional(),
  url: z.string().max(2000).optional(),
});

// ─── Task approve (POST /api/tasks/[id]/approve) ──────────────────
export const approveTaskSchema = z.object({
  approvalComment: z.string().max(5000).optional(),
  childTasks: z
    .array(
      z.object({
        title: str(500),
        description: z.string().max(10000).optional(),
        assigneeIds: z.array(idStr()).optional(),
        priority: z.enum(Object.values(Priority) as [string, ...string[]]).optional(),
      }),
    )
    .max(20)
    .optional(),
});

// ─── Task reject (POST /api/tasks/[id]/reject) ───────────────────
export const rejectTaskSchema = z.object({
  rejectionReason: str(5000),
  changesNeeded: z.array(z.string().min(1).max(2000)).min(1).max(20),
});

// ─── Task clarification (POST /api/tasks/[id]/request-clarification) ─
export const requestClarificationSchema = z.object({
  questions: z.array(z.string().min(1).max(2000)).min(1).max(20),
});

// ─── Project create (POST /api/projects) ──────────────────────────
export const createProjectSchema = z.object({
  name: str(200),
  description: z.string().max(5000).optional(),
  memberIds: z.array(idStr()).optional(),
});

// ─── Project doc create (POST /api/projects/[id]/docs) ────────────
export const createProjectDocSchema = z.object({
  title: str(500),
  content: str(100000),
  summary: z.string().max(2000).optional(),
});

// ─── Project doc update (PATCH /api/projects/[id]/docs/[docId]) ───
export const updateProjectDocSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().min(1).max(100000).optional(),
  summary: z.string().max(2000).nullable().optional(),
});

// ─── Project member (POST/DELETE /api/projects/[id]/members) ──────
export const projectMemberSchema = z.object({
  agentId: idStr(),
});

// ─── DM create (POST /api/channels/dm) ────────────────────────────
export const createDMSchema = z.object({
  profileId: idStr(),
});

// ─── Channel message (POST /api/channels/[channelId]/messages) ────
export const createChannelMessageSchema = z.object({
  content: z.string().min(1, "Content is required").max(50000),
  attachmentIds: z.array(idStr()).max(20).optional(),
});

// ─── Queue item create (POST /api/queue) ──────────────────────────
export const createQueueItemSchema = z.object({
  title: str(500),
  description: z.string().max(10000).optional(),
  notes: z.string().max(10000).optional(),
  priority: z.enum(Object.values(Priority) as [string, ...string[]]).optional(),
  relatedTaskId: idStr().optional(),
  itemType: z.string().max(50).optional(),
  autoGenerated: z.boolean().optional(),
  generatedFrom: z.string().max(200).optional(),
});

// ─── Queue item update (PATCH /api/queue/[id]) ───────────────────
export const updateQueueItemSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  priority: z.enum(Object.values(Priority) as [string, ...string[]]).optional(),
  status: z.enum(Object.values(QueueItemStatus) as [string, ...string[]]).optional(),
  notes: z.string().max(10000).optional(),
});

// ─── Notification preferences (PUT /api/user-notifications/preferences) ─
export const updateNotificationPrefsSchema = z.object({
  taskDone: z.boolean().optional(),
  taskNeedsReview: z.boolean().optional(),
  taskClarificationRequested: z.boolean().optional(),
  taskApproved: z.boolean().optional(),
  taskRejected: z.boolean().optional(),
  newComment: z.boolean().optional(),
  mention: z.boolean().optional(),
  deliverableSubmitted: z.boolean().optional(),
  taskAssigned: z.boolean().optional(),
  teamUpdate: z.boolean().optional(),
  documentAdded: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  quietStart: z.string().max(10).optional(),
  quietEnd: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
});

// ─── Message reaction (POST /api/messages/[id]/reactions) ─────────
export const messageReactionSchema = z.object({
  emoji: z.enum(Object.values(MessageReactionEmoji) as [string, ...string[]]),
});

// ─── Admin setup (POST /api/auth/setup) ──────────────────────────
export const setupSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(100),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

// ─── Password reset (POST /api/auth/reset-password) ───────────────
export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required").max(500),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
});

// ─── Storage upload (POST /api/storage/upload) ────────────────────
export const storageUploadSchema = z.object({
  fileName: z.string().min(1, "fileName is required").max(300),
  mimeType: z.string().min(1, "mimeType is required").max(200),
  prefix: z.enum(Object.values(StoragePrefix) as [string, ...string[]]).optional(),
});

// ─── Notification mark-delivered (POST /api/notifications/mark-delivered) ─
export const markDeliveredSchema = z.object({
  id: idStr().optional(),
  ids: z.array(idStr()).optional(),
});

// ─── Recurring task update (PATCH /api/recurring-tasks/[id]) ──────
export const updateRecurringTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).optional(),
  status: z.string().max(50).optional(),
  priority: z.enum(Object.values(Priority) as [string, ...string[]]).optional(),
  tags: tags().nullable(),
  timezone: z.string().max(50).optional(),
  projectId: idStr().nullable().optional(),
  assigneeIds: z.array(idStr()).optional(),
  recurrenceConfig: z.record(z.string(), z.unknown()).optional(),
});

// ─── Onboarding category (PUT /api/onboarding) ───────────────────
export const onboardingCategorySchema = z.object({
  categoryId: z.string().max(200).optional(),
});

// ─── Push subscription (POST /api/user-notifications/subscribe) ───
export const pushSubscribeSchema = z.object({
  endpoint: z.string().min(1).max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(200),
  }),
});

// ─── Push unsubscribe (DELETE /api/user-notifications/subscribe) ──
export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().min(1).max(2000),
});
