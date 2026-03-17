// Register all Pothos type definitions on the builder (side effects)
import "./types";

export { builder } from "./builder";
export type { GraphQLContext, SessionPayload } from "./builder";
export { CURRENT_CONFIG_VERSION } from "./config-version";

// Connection refs used by server-side resolvers
export { ActivityConnectionRef } from "./types/activity";
export { ChannelMessageConnectionRef } from "./types/channel";
export { MessageConnectionRef } from "./types/message";

// PubSub — GraphQL real-time event bus
export {
  pubsub,
  PubSubEvent,
  channelMessageTopic,
  channelReactionTopic,
  agentStreamTopic,
  notificationTopic,
  messageTopic,
  messageReactionTopic,
  taskTopic,
  taskProjectTopic,
  activityProjectTopic,
  agentActionAgentTopic,
  agentActionProjectTopic,
} from "./pubsub";
export type { PubSubEvents } from "./pubsub";

// Re-export createYoga so apps don't depend on graphql-yoga directly
export { createYoga } from "graphql-yoga";
