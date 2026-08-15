import { resolveAgent } from "./resolve-agent";
import { requireAgentCapability } from "@/server/services/agent-authz";
import { isSystemShutdown } from "@/server/system-settings";
import { errorResponse, handleError } from "./json-response";
import { featureGateResponse, type FeatureGate } from "./feature-gate";

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
  opts: {
    feature?: FeatureGate;
    capability?: string;
    allowPendingSetup?: boolean;
    /** Block writes while the instance is in maintenance/shutdown (503). true = default message. */
    blockOnShutdown?: boolean | { error?: string };
  } = {},
) {
  return async (request: Request, context: C): Promise<Response> => {
    try {
      const featureBlock = await featureGateResponse(opts.feature);
      if (featureBlock) return featureBlock;
      if (opts.blockOnShutdown && (await isSystemShutdown())) {
        const msg =
          typeof opts.blockOnShutdown === "object" ? opts.blockOnShutdown.error : undefined;
        return errorResponse(
          msg ?? "The system is in shutdown mode. Please try again shortly.",
          503,
          "SYSTEM_SHUTDOWN",
        );
      }
      const agent = await resolveAgent(request, { allowPendingSetup: opts.allowPendingSetup });
      if (opts.capability) {
        await requireAgentCapability(agent, opts.capability);
      }
      return await handler(request, agent, context);
    } catch (err) {
      return handleError(err);
    }
  };
}
