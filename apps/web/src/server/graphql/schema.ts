import { builder } from "./builder";

// Import all type definitions (side-effect registrations)
import "./types";

// Import all query resolvers
import "./queries";

// Import all mutation resolvers
import "./mutations";

// Import all subscription resolvers
import "./subscriptions";

// Build and export the schema
export const schema = builder.toSchema();
