import { Client, fetchExchange, subscriptionExchange } from "urql";
import { cacheExchange } from "@urql/exchange-graphcache";
import { createClient as createSSEClient } from "graphql-sse";
import { KANBAN_BOARD_QUERY } from "./queries/tasks";
import { MESSAGES_BY_TASK_QUERY, MESSAGES_BY_TASK_CONNECTION_QUERY } from "./queries/messages";
import { CHANNEL_MESSAGES_QUERY, CHANNEL_MESSAGE_CONNECTION_QUERY } from "./queries/channels";
import { ACTIVITIES_FOR_AGENT_QUERY, ACTIVITIES_BY_AGENT_QUERY } from "./queries/activities";
import { AGENT_ACTIONS_BY_AGENT_QUERY } from "./queries/agent-actions";
import { NOTIFICATIONS_BY_AGENT_QUERY } from "./queries/notifications";

const KANBAN_STATUS_KEYS = [
  "inbox",
  "assigned",
  "in_progress",
  "review",
  "blocked",
  "done",
] as const;

/** Set by DndBoardWrapper before updateTask mutation; read by cache update to insert at position. */
let pendingMoveInsertAfterTaskId: string | null = null;
export function setPendingMoveInsertAfter(taskId: string | null) {
  pendingMoveInsertAfterTaskId = taskId;
}

/** Cache keys for kanban: "all projects" (no filter) and project-specific (when task has projectId). */
function kanbanCacheKeys(updatedTask: { projectId?: string | null }): { projectId?: string }[] {
  const keys: { projectId?: string }[] = [{}];
  if (updatedTask.projectId) keys.push({ projectId: updatedTask.projectId });
  return keys;
}

let sseRetryAttempt = 0;
type ConnectionListener = (connected: boolean) => void;
const connectionListeners = new Set<ConnectionListener>();
let sseConnected = true;

function notifyConnectionState(connected: boolean) {
  if (sseConnected === connected) return;
  sseConnected = connected;
  connectionListeners.forEach((fn) => fn(connected));
}

/** Subscribe to SSE connection state changes. Returns unsubscribe function. */
export function onConnectionChange(fn: ConnectionListener): () => void {
  connectionListeners.add(fn);
  fn(sseConnected); // emit current state immediately
  return () => connectionListeners.delete(fn);
}

const sseClient = createSSEClient({
  url: "/api/graphql",
  retry: async () => {
    notifyConnectionState(false);
    const attempt = sseRetryAttempt++;
    const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
    const jitter = Math.random() * 1000;
    await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
  },
  on: {
    connected() {
      sseRetryAttempt = 0;
      notifyConnectionState(true);
    },
  },
});

/** Shared kanban column-move updater. When insertAfterTaskId is provided, inserts at that position. */
function makeKanbanUpdater(
  updatedTask: { id: string; status: string; projectId?: string | null },
  insertAfterTaskId?: string | null,
) {
  return (data: any) => {
    if (!data) return data;
    let fromKey: string | null = null;
    for (const key of KANBAN_STATUS_KEYS) {
      const list = data[key];
      if (Array.isArray(list) && list.some((t: any) => t.id === updatedTask.id)) {
        fromKey = key;
        break;
      }
    }
    if (fromKey == null) return data;
    if (fromKey === updatedTask.status) return data;
    const next = { ...data };
    next[fromKey] = data[fromKey].filter((t: any) => t.id !== updatedTask.id);
    const toList = (data[updatedTask.status] || []).filter((t: any) => t.id !== updatedTask.id);
    let insertIndex = toList.length;
    if (insertAfterTaskId != null) {
      const idx = toList.findIndex((t: any) => t.id === insertAfterTaskId);
      if (idx !== -1) insertIndex = idx + 1;
    }
    next[updatedTask.status] = [
      ...toList.slice(0, insertIndex),
      updatedTask,
      ...toList.slice(insertIndex),
    ];
    return next;
  };
}

export const urqlClient = new Client({
  url: "/api/graphql",
  exchanges: [
    cacheExchange({
      keys: {
        TaskStatusCount: () => null,
        TasksByStatus: () => null,
        WorkSummary: () => null,
        MessageConnection: () => null,
      },
      updates: {
        Mutation: {
          updateTask(result: any, _args: any, cache: any) {
            const updatedTask = result?.updateTask;
            if (!updatedTask?.id || updatedTask.status == null) return;
            const updater = makeKanbanUpdater(updatedTask, pendingMoveInsertAfterTaskId);
            pendingMoveInsertAfterTaskId = null;
            for (const variables of kanbanCacheKeys(updatedTask)) {
              cache.updateQuery({ query: KANBAN_BOARD_QUERY, variables }, updater);
            }
          },
          deleteChannelMessage(_result: any, args: any, cache: any) {
            // Remove the message from all channel message cache entries
            const messageId = args.messageId;
            if (!messageId) return;
            const connFields = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "channelMessageConnection");
            for (const field of connFields) {
              cache.updateQuery(
                { query: CHANNEL_MESSAGE_CONNECTION_QUERY, variables: field.arguments },
                (data: any) => {
                  if (!data?.channelMessageConnection?.messages) return data;
                  return {
                    ...data,
                    channelMessageConnection: {
                      ...data.channelMessageConnection,
                      messages: data.channelMessageConnection.messages.filter(
                        (m: any) => m.id !== messageId,
                      ),
                    },
                  };
                },
              );
            }
          },
          pinChannelMessage(_result: any, _args: any, cache: any) {
            // Invalidate pinned messages list so it refetches
            const fields = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "channelPinnedMessages");
            for (const field of fields) {
              cache.invalidate("Query", field.fieldName, field.arguments);
            }
          },
          unpinChannelMessage(_result: any, _args: any, cache: any) {
            const fields = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "channelPinnedMessages");
            for (const field of fields) {
              cache.invalidate("Query", field.fieldName, field.arguments);
            }
          },
        },
        Subscription: {
          // NOTE: taskUpdated does NOT update KANBAN_BOARD_QUERY in graphcache.
          // KanbanBoard.tsx manages columnStates locally via its own useSubscription
          // handler. Updating the cache here would cause boardResult.data to change,
          // triggering a useEffect that wipes paginated tasks beyond the initial page.
          // Entity-level field updates (title, priority, etc.) still propagate
          // automatically via graphcache's normalized entity merging.
          taskUpdated(_result: any, _args: any, cache: any) {
            // Invalidate task count badges and analytics queries so they stay fresh
            const staleFields = [
              "taskCountsByStatus",
              "taskStatusCounts",
              "taskCycleTimes",
              "taskCompletionTrend",
              "agentWorkloadDistribution",
              "reviewMetrics",
              "tasks",
            ];
            for (const fieldName of staleFields) {
              const fields = cache
                .inspectFields("Query")
                .filter((f: any) => f.fieldName === fieldName);
              for (const field of fields) {
                cache.invalidate("Query", field.fieldName, field.arguments);
              }
            }
          },
          messageCreated(result: any, _args: any, cache: any) {
            const newMessage = result.messageCreated;
            if (!newMessage) return;
            cache.updateQuery(
              { query: MESSAGES_BY_TASK_QUERY, variables: { taskId: newMessage.taskId } },
              (data: any) => {
                if (!data?.messagesByTask) return data;
                if (data.messagesByTask.some((m: any) => m.id === newMessage.id)) return data;
                return { ...data, messagesByTask: [...data.messagesByTask, newMessage] };
              },
            );
            // Also update the connection-based query cache
            const connFields = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "messagesByTaskConnection");
            for (const field of connFields) {
              if (field.arguments?.taskId !== newMessage.taskId) continue;
              cache.updateQuery(
                { query: MESSAGES_BY_TASK_CONNECTION_QUERY, variables: field.arguments },
                (data: any) => {
                  if (!data?.messagesByTaskConnection?.messages) return data;
                  if (
                    data.messagesByTaskConnection.messages.some((m: any) => m.id === newMessage.id)
                  )
                    return data;
                  return {
                    ...data,
                    messagesByTaskConnection: {
                      ...data.messagesByTaskConnection,
                      messages: [...data.messagesByTaskConnection.messages, newMessage],
                    },
                  };
                },
              );
            }
          },
          activityCreated(result: any, _args: any, cache: any) {
            const newActivity = result.activityCreated;
            if (!newActivity) return;
            const fields = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "activitiesForAgent");
            for (const field of fields) {
              // Skip cache entries for a different project
              if (field.arguments?.projectId && field.arguments.projectId !== newActivity.projectId)
                continue;
              cache.updateQuery(
                { query: ACTIVITIES_FOR_AGENT_QUERY, variables: field.arguments },
                (data: any) => {
                  if (!data?.activitiesForAgent) return data;
                  if (data.activitiesForAgent.some((a: any) => a.id === newActivity.id))
                    return data;
                  return { ...data, activitiesForAgent: [newActivity, ...data.activitiesForAgent] };
                },
              );
            }
            // Also update activitiesByAgent cache entries
            const agentFields = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "activitiesByAgent");
            for (const field of agentFields) {
              // Only update cache entries whose agentId matches this activity's agent
              const activityAgentId = newActivity.profile?.agentId;
              if (!activityAgentId || field.arguments?.agentId !== activityAgentId) continue;
              cache.updateQuery(
                { query: ACTIVITIES_BY_AGENT_QUERY, variables: field.arguments },
                (data: any) => {
                  if (!data?.activitiesByAgent) return data;
                  if (data.activitiesByAgent.some((a: any) => a.id === newActivity.id)) return data;
                  return { ...data, activitiesByAgent: [newActivity, ...data.activitiesByAgent] };
                },
              );
            }
            // Invalidate activity trend analytics
            const trendFields = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "activityTrend");
            for (const field of trendFields) {
              cache.invalidate("Query", field.fieldName, field.arguments);
            }
          },
          agentActionLogged(result: any, _args: any, cache: any) {
            const newAction = result.agentActionLogged;
            if (!newAction) return;
            const fields = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "agentActionsByAgent");
            for (const field of fields) {
              // Skip cache entries for a different agent
              if (field.arguments?.agentId && field.arguments.agentId !== newAction.agentId)
                continue;
              cache.updateQuery(
                { query: AGENT_ACTIONS_BY_AGENT_QUERY, variables: field.arguments },
                (data: any) => {
                  if (!data?.agentActionsByAgent) return data;
                  if (data.agentActionsByAgent.some((a: any) => a.id === newAction.id)) return data;
                  return {
                    ...data,
                    agentActionsByAgent: [...data.agentActionsByAgent, newAction],
                  };
                },
              );
            }
          },
          notificationCreated(result: any, _args: any, cache: any) {
            const newNotification = result.notificationCreated;
            if (!newNotification?.mentionedAgentId) return;
            const targetAgentId = newNotification.mentionedAgentId;
            const fields = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "notificationsByAgent");
            for (const field of fields) {
              if (field.arguments?.agentId !== targetAgentId) continue;
              cache.updateQuery(
                { query: NOTIFICATIONS_BY_AGENT_QUERY, variables: field.arguments },
                (data: any) => {
                  if (!data?.notificationsByAgent) return data;
                  if (data.notificationsByAgent.some((n: any) => n.id === newNotification.id))
                    return data;
                  return {
                    ...data,
                    notificationsByAgent: [newNotification, ...data.notificationsByAgent],
                  };
                },
              );
            }
          },
          channelMessageCreated(result: any, _args: any, cache: any) {
            const newMessage = result.channelMessageCreated;
            if (!newMessage?.channelId) return;
            const channelId = newMessage.channelId;
            const fieldsMessages = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "channelMessages");
            for (const field of fieldsMessages) {
              if (field.arguments?.channelId !== channelId) continue;
              cache.updateQuery(
                { query: CHANNEL_MESSAGES_QUERY, variables: field.arguments },
                (data: any) => {
                  if (!data?.channelMessages) return data;
                  if (data.channelMessages.some((m: any) => m.id === newMessage.id)) return data;
                  return { ...data, channelMessages: [...data.channelMessages, newMessage] };
                },
              );
            }
            const fieldsConn = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "channelMessageConnection");
            for (const field of fieldsConn) {
              if (field.arguments?.channelId !== channelId) continue;
              cache.updateQuery(
                { query: CHANNEL_MESSAGE_CONNECTION_QUERY, variables: field.arguments },
                (data: any) => {
                  if (!data?.channelMessageConnection?.messages) return data;
                  if (
                    data.channelMessageConnection.messages.some((m: any) => m.id === newMessage.id)
                  )
                    return data;
                  return {
                    ...data,
                    channelMessageConnection: {
                      ...data.channelMessageConnection,
                      messages: [...data.channelMessageConnection.messages, newMessage],
                    },
                  };
                },
              );
            }
            // Invalidate channels list so sidebar unread badges refetch
            const channelsFields = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "channels");
            for (const field of channelsFields) {
              cache.invalidate("Query", field.fieldName, field.arguments);
            }
          },
          channelMessageReactionChanged(result: any, _args: any, cache: any) {
            const updatedMessage = result.channelMessageReactionChanged;
            if (!updatedMessage?.id || !updatedMessage?.channelId) return;
            const channelId = updatedMessage.channelId;
            const updaterMessages = (data: any) => {
              if (!data?.channelMessages) return data;
              return {
                ...data,
                channelMessages: data.channelMessages.map((m: any) =>
                  m.id === updatedMessage.id ? updatedMessage : m,
                ),
              };
            };
            const fieldsMessages = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "channelMessages");
            for (const field of fieldsMessages) {
              if (field.arguments?.channelId !== channelId) continue;
              cache.updateQuery(
                { query: CHANNEL_MESSAGES_QUERY, variables: field.arguments },
                updaterMessages,
              );
            }
            const fieldsConn = cache
              .inspectFields("Query")
              .filter((f: any) => f.fieldName === "channelMessageConnection");
            for (const field of fieldsConn) {
              if (field.arguments?.channelId !== channelId) continue;
              cache.updateQuery(
                { query: CHANNEL_MESSAGE_CONNECTION_QUERY, variables: field.arguments },
                (data: any) => {
                  if (!data?.channelMessageConnection?.messages) return data;
                  return {
                    ...data,
                    channelMessageConnection: {
                      ...data.channelMessageConnection,
                      messages: data.channelMessageConnection.messages.map((m: any) =>
                        m.id === updatedMessage.id ? updatedMessage : m,
                      ),
                    },
                  };
                },
              );
            }
          },
        },
      },
    }),
    subscriptionExchange({
      forwardSubscription(operation) {
        return {
          subscribe(sink) {
            const dispose = sseClient.subscribe(
              { query: operation.query!, variables: operation.variables },
              sink,
            );
            return { unsubscribe: dispose };
          },
        };
      },
    }),
    fetchExchange,
  ],
});
