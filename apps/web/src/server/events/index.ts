// Import handlers first to register them (side-effect imports)
// agentState must be first — patches agent record before other handlers read it
import "./handlers/agentState";
import "./handlers/activity";
import "./handlers/statusHistory";
import "./handlers/notification";
import "./handlers/subscription";
import "./handlers/workSession";
import "./handlers/cleanup";
import "./handlers/queue";
import "./handlers/project";
import "./handlers/user-notification";
import "./handlers/budget";
import "./handlers/auto-dispatch-sandbox";
import "./handlers/dependency-wakeup";

// Re-export emit for use in mutations
export { emit } from "./bus";
export type { SystemEvent, EventType } from "./types";
