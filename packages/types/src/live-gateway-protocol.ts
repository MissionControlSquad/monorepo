// ─── Live Gateway WebSocket Protocol ─────────────────────────────────────────
//
// Messages flowing Plugin → MC (fan-in WebSocket).
// Each message is JSON-serialised and sent as a text frame.
// Both sides must treat unknown `type` values as no-ops (forward compatibility).

// ── Shared structures ─────────────────────────────────────────────────────────

export interface VMMeta {
  hostname: string;
  platform: string;       // e.g. "linux", "darwin", "win32"
  arch: string;           // e.g. "x64", "arm64"
  openclawVersion?: string;
}

export interface AgentInfo {
  slug: string;           // OpenClaw agent slug (unique per VM)
  name: string;
  status: "idle" | "active" | "blocked";
  detailedStatus?: string | null;
  statusMessage?: string | null;
  currentTaskId?: string | null;
}

export type VMErrorCode =
  | "auth_failed"
  | "token_revoked"
  | "fingerprint_mismatch"
  | "nonce_replay"
  | "rate_limited"
  | "internal_error";

// ── Plugin → MC messages ──────────────────────────────────────────────────────

/** First message sent by plugin after WS connection is established. */
export interface MsgHello {
  type: "vm.hello";
  /** Install token (raw, 64-char hex) or per-VM token (after first handshake). */
  token: string;
  /** Stable fingerprint derived by plugin from machine identifiers. */
  fingerprint: string;
  /** Random hex nonce — consumed atomically by MC, prevents replay. */
  nonce: string;
  /** Unix timestamp (ms) on plugin side — MC rejects if |delta| > 30 000 ms. */
  timestamp: number;
  pluginVersion: string;
  meta: VMMeta;
}

/** Periodic heartbeat — sent every 30 s by plugin. */
export interface MsgPing {
  type: "vm.ping";
  timestamp: number;
}

/** Plugin reports current agent roster + statuses. Sent on connect and on change. */
export interface MsgAgentsReport {
  type: "vm.agents_report";
  agents: AgentInfo[];
}

/** Single-agent status delta — sent whenever an agent's status changes. */
export interface MsgAgentStatus {
  type: "vm.agent_status";
  slug: string;
  status: AgentInfo["status"];
  detailedStatus?: string | null;
  statusMessage?: string | null;
  currentTaskId?: string | null;
}

/** Agent sent a chat/activity message. */
export interface MsgAgentMessage {
  type: "vm.agent_message";
  slug: string;
  taskId?: string | null;
  content: string;      // may contain markdown; MC strips HTML before storage
  timestamp: number;
}

/** Agent completed a task. */
export interface MsgTaskDone {
  type: "vm.task_done";
  slug: string;
  taskId: string;
  summary?: string | null;
  timestamp: number;
}

/** ACK sent by plugin after successfully receiving a task delivery. */
export interface MsgTaskAck {
  type: "vm.task_ack";
  deliveryId: string;   // PendingTaskDelivery.id
}

export type PluginToMC =
  | MsgHello
  | MsgPing
  | MsgAgentsReport
  | MsgAgentStatus
  | MsgAgentMessage
  | MsgTaskDone
  | MsgTaskAck;

// ── MC → Plugin messages ──────────────────────────────────────────────────────

/** Sent immediately after a successful vm.hello handshake. */
export interface MsgWelcome {
  type: "mc.welcome";
  vmId: string;
  /** Per-VM token (raw). Store this; use on all future connections. */
  vmToken?: string;     // only present on FIRST handshake (install token path)
}

/** MC-side pong in response to vm.ping. */
export interface MsgPong {
  type: "mc.pong";
  timestamp: number;
}

/** Deliver a task to a specific agent on this VM. */
export interface MsgDeliverTask {
  type: "mc.deliver_task";
  deliveryId: string;   // PendingTaskDelivery.id — plugin echoes back in task_ack
  agentSlug: string;
  taskId: string;
  message: string;
  priority: "low" | "medium" | "high" | "urgent";
}

/** Authentication / protocol error — connection will be closed after this. */
export interface MsgError {
  type: "mc.error";
  code: VMErrorCode;
  message: string;
}

export type MCToPlugin =
  | MsgWelcome
  | MsgPong
  | MsgDeliverTask
  | MsgError;

// ── Protocol constants ────────────────────────────────────────────────────────

export const LIVE_GATEWAY = {
  /** WebSocket path on MC server. */
  PATH: "/live-gateway",
  /** Max clock skew allowed on vm.hello timestamp (ms). */
  MAX_CLOCK_SKEW_MS: 30_000,
  /** Plugin sends ping every N ms. */
  PLUGIN_PING_INTERVAL_MS: 30_000,
  /** MC drops connection if no message received within this window (ms). */
  MC_EVICT_TIMEOUT_MS: 90_000,
  /** PendingTaskDelivery TTL (ms) — tasks older than this are not delivered. */
  TASK_DELIVERY_TTL_MS: 24 * 60 * 60 * 1_000,
  /** Max dedup Set size on plugin side. */
  PLUGIN_DEDUP_LIMIT: 500,
} as const;
