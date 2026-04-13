export const TASK_STATUSES = [
  { id: "inbox", label: "Inbox", color: "gray" },
  { id: "assigned", label: "Assigned", color: "blue" },
  { id: "in_progress", label: "In Progress", color: "yellow" },
  { id: "review", label: "Review", color: "purple" },
  { id: "done", label: "Done", color: "green" },
  { id: "blocked", label: "Blocked", color: "red" },
] as const;

export const PRIORITY_COLORS = {
  low: "bg-gray-200 text-gray-700",
  medium: "bg-warning/20 text-warning",
  high: "bg-destructive/20 text-destructive",
  urgent: "bg-purple-200 text-purple-800",
};

/** @deprecated Use TaskStatus from domain-constants (imported via @agentcenter/utils) for comparisons. This type is kept for UI list typing only. */
export type TaskStatusId = (typeof TASK_STATUSES)[number]["id"];

// Agent base statuses
export const AGENT_STATUSES = {
  idle: { label: "Idle", color: "gray", icon: "Circle" },
  active: { label: "Active", color: "green", icon: "Zap" },
  blocked: { label: "Blocked", color: "red", icon: "AlertCircle" },
} as const;

// Agent detailed/granular statuses
export const AGENT_DETAILED_STATUSES = {
  thinking: { label: "Thinking", color: "purple", icon: "Brain", parentStatus: "active" },
  coding: { label: "Coding", color: "blue", icon: "Code", parentStatus: "active" },
  reviewing: { label: "Reviewing", color: "indigo", icon: "Search", parentStatus: "active" },
  researching: { label: "Researching", color: "yellow", icon: "BookOpen", parentStatus: "active" },
  deploying: { label: "Deploying", color: "orange", icon: "Rocket", parentStatus: "active" },
  testing: { label: "Testing", color: "cyan", icon: "TestTube", parentStatus: "active" },
  writing: { label: "Writing", color: "emerald", icon: "PenTool", parentStatus: "active" },
  waiting_review: {
    label: "Waiting for Review",
    color: "amber",
    icon: "Clock",
    parentStatus: "blocked",
  },
  waiting_input: {
    label: "Waiting for Input",
    color: "amber",
    icon: "MessageCircle",
    parentStatus: "blocked",
  },
  waiting_dependency: {
    label: "Waiting on Dep",
    color: "amber",
    icon: "Link",
    parentStatus: "blocked",
  },
} as const;

export type AgentStatusId = keyof typeof AGENT_STATUSES;
export type AgentDetailedStatus = keyof typeof AGENT_DETAILED_STATUSES;

// Tailwind classes for status dots (with animations for active states)
export const STATUS_DOT_CLASSES: Record<string, string> = {
  idle: "bg-gray-300",
  active: "bg-success animate-pulse",
  blocked: "bg-destructive",
  offline: "bg-gray-400 ring-1 ring-gray-300",
  thinking: "bg-purple-500 animate-pulse",
  coding: "bg-blue-500 animate-pulse",
  reviewing: "bg-indigo-500 animate-pulse",
  researching: "bg-yellow-500 animate-pulse",
  deploying: "bg-orange-500 animate-pulse",
  testing: "bg-cyan-500 animate-pulse",
  writing: "bg-emerald-500 animate-pulse",
  waiting_review: "bg-amber-400",
  waiting_input: "bg-amber-400",
  waiting_dependency: "bg-amber-400",
};

// Tailwind classes for status badges
export const STATUS_BADGE_CLASSES: Record<string, string> = {
  idle: "bg-gray-100 text-gray-700",
  active: "bg-success/15 text-success",
  blocked: "bg-destructive/15 text-destructive",
  offline: "bg-gray-100 text-gray-500",
  thinking: "bg-purple-100 text-purple-800",
  coding: "bg-blue-100 text-blue-800",
  reviewing: "bg-indigo-100 text-indigo-800",
  researching: "bg-yellow-100 text-yellow-800",
  deploying: "bg-orange-100 text-orange-800",
  testing: "bg-cyan-100 text-cyan-800",
  writing: "bg-emerald-100 text-emerald-800",
  waiting_review: "bg-amber-100 text-amber-800",
  waiting_input: "bg-amber-100 text-amber-800",
  waiting_dependency: "bg-amber-100 text-amber-800",
};

// Agent levels
export const AGENT_LEVELS = {
  intern: { label: "Intern", color: "gray", description: "Needs approval for most actions" },
  specialist: {
    label: "Specialist",
    color: "blue",
    description: "Works independently in their domain",
  },
  lead: { label: "Lead", color: "purple", description: "Full autonomy, can review and delegate" },
} as const;

export type AgentLevelId = keyof typeof AGENT_LEVELS;

// Column icons (lucide icon names)
export const COLUMN_ICONS: Record<string, string> = {
  inbox: "Inbox",
  assigned: "UserCheck",
  in_progress: "PlayCircle",
  review: "Eye",
  done: "CheckCircle2",
  blocked: "AlertTriangle",
};

// Column empty states
export const COLUMN_EMPTY_STATES: Record<string, { message: string; hint: string }> = {
  inbox: { message: "No incoming tasks", hint: "Create a new task to get started" },
  assigned: { message: "No assigned tasks", hint: "Drag tasks here or assign agents" },
  in_progress: { message: "Nothing in progress", hint: "Tasks being worked on appear here" },
  review: { message: "Nothing to review", hint: "Tasks pending review show up here" },
  done: { message: "No completed tasks", hint: "Finished tasks land here" },
  blocked: { message: "Nothing blocked", hint: "That's a good thing!" },
};

// Heartbeat timeout: 2 minutes
export const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;

// Maximum file size for channel attachments: 25 MB
export const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Maximum byte length for live-gateway task delivery messages
export const MAX_MESSAGE_BYTES = 4096;

// Platform-agnostic hex colors for status values (usable by mobile, charts, Electron)
export const STATUS_HEX_COLORS: Record<string, string> = {
  // Task statuses
  inbox: "#6b7280",
  assigned: "#2563eb",
  in_progress: "#d97706",
  review: "#7c3aed",
  done: "#16a34a",
  blocked: "#dc2626",
  // Agent statuses
  active: "#16a34a",
  idle: "#6b7280",
  offline: "#9ca3af",
  deactivated: "#9ca3af",
  // Detailed agent statuses
  thinking: "#7c3aed",
  coding: "#2563eb",
  reviewing: "#4f46e5",
  researching: "#d97706",
  deploying: "#ea580c",
  testing: "#0891b2",
  writing: "#059669",
  waiting_review: "#d97706",
  waiting_input: "#d97706",
  waiting_dependency: "#d97706",
  // Project statuses
  archived: "#9ca3af",
  paused: "#d97706",
  // Queue statuses
  pending: "#6b7280",
  completed: "#16a34a",
  failed: "#dc2626",
  cancelled: "#9ca3af",
};

// Platform-agnostic hex colors for priority values
export const PRIORITY_HEX_COLORS: Record<string, string> = {
  low: "#6b7280",
  medium: "#d97706",
  high: "#dc2626",
  urgent: "#7c3aed",
};

// Text icons for priority (no icon library required)
export const PRIORITY_ICONS: Record<string, string> = {
  low: "↓",
  medium: "→",
  high: "↑",
  urgent: "⚡",
};

// Ordered list of priority values (low → urgent)
export const PRIORITY_VALUES = ["low", "medium", "high", "urgent"] as const;

// Priority filter type: empty string means "any priority"
export type PriorityFilter = "" | "low" | "medium" | "high" | "urgent";

// Filter options for priority (includes empty string as "Any")
export const PRIORITY_FILTER_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "Any" },
  { key: "low", label: "Low" },
  { key: "medium", label: "Medium" },
  { key: "high", label: "High" },
  { key: "urgent", label: "Urgent" },
];

// Hex colors for deliverable kind values (usable by mobile, charts, Electron)
export const DELIVERABLE_KIND_HEX_COLORS: Record<string, string> = {
  markdown: "#2563eb",
  code: "#7c3aed",
  link: "#059669",
  file: "#d97706",
};

// Emoji icons for deliverable kind values (no icon library required)
export const DELIVERABLE_KIND_ICONS: Record<string, string> = {
  markdown: "📄",
  code: "💻",
  link: "🔗",
  file: "📎",
};

export const DUE_DATE_FILTER_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "Any date" },
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due today" },
  { key: "this_week", label: "This week" },
  { key: "no_due_date", label: "No due date" },
];

// Cloud VM status labels
export const CLOUD_VM_STATUS_LABELS: Record<string, string> = {
  provisioning: "Provisioning",
  waiting_for_ssh: "Waiting for SSH",
  installing_deps: "Installing Deps",
  installing_openclaw: "Installing OpenClaw",
  configuring: "Configuring",
  starting_service: "Starting Service",
  running: "Running",
  stopped: "Stopped",
  error: "Error",
  destroying: "Destroying",
  destroyed: "Destroyed",
};

// Cloud VM statuses that indicate an in-progress transition
export const CLOUD_VM_TRANSITIONAL_STATUSES: string[] = [
  "provisioning",
  "waiting_for_ssh",
  "installing_deps",
  "installing_openclaw",
  "configuring",
  "starting_service",
  "destroying",
];
