/**
 * Issue → goal fallback resolvers (Epic #11). Moved to @agentcenter/utils so web/desktop/mobile share
 * one source of truth; re-exported here for existing importers. Not yet wired to the task path (D2).
 */
export { resolveIssueGoalId, resolveNextIssueGoalId } from "@agentcenter/utils";
