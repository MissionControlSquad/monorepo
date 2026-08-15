import { resolveAgent } from "./resolve-agent";
import { requireAgentCapability } from "@/server/services/agent-authz";
import { isFeatureEnabled } from "@/server/feature-flags";
import { errorResponse, handleError } from "./json-response";
import type { FlagKey } from "@agentcenter/utils";

type ResolvedAgent = Awaited<ReturnType<typeof resolveAgent>>;

/**
 * Agent-plane twin of `withTenancy`. Wraps a Next.js route handler with the standard agent envelope so
 * routes stop repeating `try { const agent = await resolveAgent(request); [feature] [capability] ... }
 * catch (err) { return handleError(err) }` by hand:
 *
 *   1. optional feature-flag gate  → 403 FEATURE_DISABLED
 *   2. resolveAgent (Bearer mc_ key, license + setup checks) → throws {error,status}
 *   3. optional UNSCOPED capability check via requireAgentCapability
 *   4. handler(request, agent, ctx)
 *   — all inside a try/catch that maps thrown {error,status} through handleError.
 *
 * `context` is optional so the wrapped export is callable with 1 arg (static routes) or 2 (dynamic
 * routes, where Next passes `{ params }`). For a capability that needs a request-scoped projectId, omit
 * `capability` here and call requireAgentCapability(agent, cap, { projectId }) inside the handler.
 *
 *   export const POST = withAgent(
 *     async (request, agent) => { ...agent.workspaceId... },
 *     { feature: FLAG_KEYS.RUNNERS, capability: AGENT_CAPABILITY.TASKS_CHECKOUT },
 *   );
 */
export function withAgent<C = unknown>(
  handler: (request: Request, agent: ResolvedAgent, context: C) => Response | Promise<Response>,
  opts: { feature?: FlagKey; capability?: string; allowPendingSetup?: boolean } = {},
) {
  return async (request: Request, context?: C): Promise<Response> => {
    try {
      if (opts.feature && !(await isFeatureEnabled(opts.feature))) {
        return errorResponse("This feature is not enabled on your plan", 403, "FEATURE_DISABLED");
      }
      const agent = await resolveAgent(request, { allowPendingSetup: opts.allowPendingSetup });
      if (opts.capability) {
        await requireAgentCapability(agent, opts.capability);
      }
      return await handler(request, agent, context as C);
    } catch (err) {
      return handleError(err);
    }
  };
}
