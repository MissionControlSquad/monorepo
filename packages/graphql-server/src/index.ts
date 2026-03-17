// Register all Pothos type definitions on the builder (side effects)
import "./types";

export { builder } from "./builder";
export type { GraphQLContext, SessionPayload } from "./builder";
export { CURRENT_CONFIG_VERSION } from "./config-version";

// Connection refs used by server-side resolvers
export { ActivityConnectionRef } from "./types/activity";
export { ChannelMessageConnectionRef } from "./types/channel";
export { MessageConnectionRef } from "./types/message";
