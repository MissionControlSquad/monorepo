// Import from package — this registers all Pothos type definitions on the builder
import "@agentcenter/graphql-server";
import { builder } from "./builder";

// Import all query resolvers
import "./queries";

// Import all mutation resolvers
import "./mutations";

// Import all subscription resolvers
import "./subscriptions";

// Build and export the schema
export const schema = builder.toSchema();
