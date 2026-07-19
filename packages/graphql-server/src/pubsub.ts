import { createPubSub } from "graphql-yoga";

/**
 * Centralized pubsub event keys.
 * Every publish() and subscribe() call MUST use these constants — never raw strings.
 *
 * Channel messages use per-channel topics to avoid fan-out waste:
 *   channelMessage:created:${channelId}
 *   channelMessage:reactionChanged:${channelId}
 */
export const PubSubEvent = {
  AGENT: {
    STATUS_CHANGED: "agent:statusChanged" as const,
    ACTION_LOGGED: "agentAction:logged" as const,
  },
  TASK: {
    UPDATED: "task:updated" as const,
  },
  ACTIVITY: {
    CREATED: "activity:created" as const,
  },
  FEATURE_FLAGS: {
    CHANGED: "featureFlags:changed" as const,
  },
  VM: {
    /** Per-VM connection status change: use vmConnectionTopic(vmId) to get the full key. */
    CONNECTED: "vm:connected" as const,
    DISCONNECTED: "vm:disconnected" as const,
  },
  BUDGET: {
    /** Per-workspace budget incident open/resolve: use budgetIncidentTopic(workspaceId). */
    INCIDENT_CHANGED: "budget:incidentChanged" as const,
  },
  // NOTIFICATION and MESSAGE use per-entity topics only (notificationTopic, messageTopic, messageReactionTopic)
  // No global constants needed — subscribers always scope by agentId/taskId.
  CHANNEL_MESSAGE: {
    /** Per-channel topic: use channelMessageTopic(channelId) to get the full key. */
    CREATED: "channelMessage:created" as const,
    REACTION_CHANGED: "channelMessage:reactionChanged" as const,
  },
};

/** Build per-channel pubsub topic for message created events. */
export function channelMessageTopic(channelId: string) {
  return `channelMessage:created:${channelId}` as const;
}

/** Build per-channel pubsub topic for reaction changed events. */
export function channelReactionTopic(channelId: string) {
  return `channelMessage:reactionChanged:${channelId}` as const;
}

/** Build per-agent pubsub topic for channel stream. One topic per agent — server pushes relevant messages here. */
export function agentStreamTopic(agentProfileId: string) {
  return `agent:stream:${agentProfileId}` as const;
}

// ── Per-entity topic builders (avoid global fan-out) ──────────────────

/** Per-agent notification topic. */
export function notificationTopic(agentId: string) {
  return `notification:created:${agentId}` as const;
}

/** Per-task message topic. */
export function messageTopic(taskId: string) {
  return `message:created:${taskId}` as const;
}

/** Per-task message reaction topic. */
export function messageReactionTopic(taskId: string) {
  return `message:reactionChanged:${taskId}` as const;
}

/** Per-task update topic. */
export function taskTopic(taskId: string) {
  return `task:task:${taskId}` as const;
}

/** Per-project task update topic. */
export function taskProjectTopic(projectId: string) {
  return `task:project:${projectId}` as const;
}

/** Per-project activity topic. */
export function activityProjectTopic(projectId: string) {
  return `activity:created:${projectId}` as const;
}

/** Per-agent action topic. */
export function agentActionAgentTopic(agentId: string) {
  return `agentAction:agent:${agentId}` as const;
}

/** Per-VM connection status topic. */
export function vmConnectionTopic(vmId: string) {
  return `vm:connection:${vmId}` as const;
}

/** Per-workspace budget incident topic (open/resolve). */
export function budgetIncidentTopic(workspaceId: string) {
  return `budget:incidentChanged:${workspaceId}` as const;
}

/** Per-project action topic. */
export function agentActionProjectTopic(projectId: string) {
  return `agentAction:project:${projectId}` as const;
}

type ChannelMessagePayload = { channelId: string; messageId: string };

type AgentDmPayload = {
  channelId: string;
  messageId: string;
  content: string;
  fromProfile: {
    id: string;
    kind: string;
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
  };
  createdAt: Date;
};

export type PubSubEvents = {
  [PubSubEvent.FEATURE_FLAGS.CHANGED]: [Record<string, never>];
  [PubSubEvent.AGENT.STATUS_CHANGED]: [{ agentId: string }];
  // Global fallbacks (used when no scoping arg is provided)
  [PubSubEvent.AGENT.ACTION_LOGGED]: [{ agentId: string; actionId: string; projectId?: string }];
  [PubSubEvent.TASK.UPDATED]: [{ taskId: string; projectId?: string }];
  [PubSubEvent.ACTIVITY.CREATED]: [{ activityId: string; projectId?: string }];
  // Per-entity topics — same payload shapes as their global counterparts
  [key: `notification:created:${string}`]: [{ agentId: string; notificationId: string }];
  [key: `message:created:${string}`]: [{ taskId: string; messageId: string }];
  [key: `message:reactionChanged:${string}`]: [{ taskId: string; messageId: string }];
  [key: `task:task:${string}`]: [{ taskId: string; projectId?: string }];
  [key: `task:project:${string}`]: [{ taskId: string; projectId?: string }];
  [key: `activity:created:${string}`]: [{ activityId: string; projectId?: string }];
  [key: `agentAction:agent:${string}`]: [{ agentId: string; actionId: string; projectId?: string }];
  [key: `agentAction:project:${string}`]: [
    { agentId: string; actionId: string; projectId?: string },
  ];
  // Per-channel topics (UI GraphQL subscriptions)
  [key: `channelMessage:created:${string}`]: [ChannelMessagePayload];
  [key: `channelMessage:reactionChanged:${string}`]: [ChannelMessagePayload];
  // Per-agent stream topics (agent SSE — DMs + group channels)
  [key: `agent:stream:${string}`]: [AgentDmPayload];
  // Per-VM connection topics
  [key: `vm:connection:${string}`]: [{ vmId: string; connected: boolean }];
  // Per-workspace budget incident topics
  [key: `budget:incidentChanged:${string}`]: [{ incidentId: string; workspaceId: string }];
};

/**
 * Derive a per-client namespace from the database URL so that
 * multiple containers sharing one Redis never leak events to each other.
 * e.g. "postgresql://...@host/client_dharmendra-jagodana" → "client_dharmendra-jagodana:"
 */
function getRedisNamespace(): string {
  const url = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || "";
  const match = url.match(/\/([^/?]+)(?:\?|$)/);
  return match ? `${match[1]}:` : "";
}

/**
 * Wraps an EventTarget to transparently prefix all event types with a namespace.
 * This isolates Redis pubsub channels per client without changing any topic strings
 * or TypeScript types in the rest of the codebase.
 */
class NamespacedEventTarget implements EventTarget {
  constructor(
    private target: EventTarget,
    private prefix: string,
  ) {}

  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.target.addEventListener(`${this.prefix}${type}`, callback, options);
  }

  removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    this.target.removeEventListener(`${this.prefix}${type}`, callback, options);
  }

  dispatchEvent(event: Event): boolean {
    const nsEvent = new CustomEvent(`${this.prefix}${event.type}`, {
      detail: (event as CustomEvent).detail,
    });
    return this.target.dispatchEvent(nsEvent);
  }
}

function buildPubSub() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    // Local dev: in-memory pubsub (single process)
    return createPubSub<PubSubEvents>();
  }

  // Production: Redis-backed pubsub (cross-process)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Redis } = require("ioredis");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createRedisEventTarget } = require("@graphql-yoga/redis-event-target");

  const publishClient = new Redis(redisUrl, { lazyConnect: true });
  const subscribeClient = new Redis(redisUrl, { lazyConnect: true });

  const redisEventTarget = createRedisEventTarget({ publishClient, subscribeClient });

  // Namespace channels so multiple clients sharing one Redis are fully isolated
  const ns = getRedisNamespace();
  const eventTarget = ns ? new NamespacedEventTarget(redisEventTarget, ns) : redisEventTarget;

  return createPubSub<PubSubEvents>({ eventTarget });
}

/**
 * globalThis singleton so the custom WS server and Next.js route handler
 * share the same pubsub instance (critical for in-memory pubsub in dev).
 */
const globalForPubSub = globalThis as unknown as { __agentcenter_pubsub?: ReturnType<typeof buildPubSub> };
export const pubsub = globalForPubSub.__agentcenter_pubsub ?? (globalForPubSub.__agentcenter_pubsub = buildPubSub());
