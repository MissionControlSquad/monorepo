import { featureGateResponse, type FeatureGate } from "./feature-gate";

export type RouteHandler<C = unknown> = (request: Request, ctx: C) => Promise<Response>;

/**
 * Wraps a Next.js App Router handler with one or more feature-flag gates, returning 403 FEATURE_DISABLED
 * (or the gate's own message/code) BEFORE the handler runs if any flag is off. The gate logic lives in
 * the shared `featureGateResponse` (feature-gate.ts), so this HOC and the withAgent/withTenancy `feature`
 * opt all behave identically — one implementation, everywhere.
 *
 * Auth-agnostic: it only checks flags, never identity. That is why routes with their OWN auth (dual
 * session-or-bearer, or a run-scoped bridge token) can still adopt it — the flag gate moves to the
 * wrapper and the route keeps its bespoke auth inside the handler.
 *
 * Usage:
 *   export const GET  = withFeature(FLAG_KEYS.LIVE_GATEWAY, getHandler);
 *   export const POST = withFeature({ flag: FLAG_KEYS.CHANNELS, error: "..." }, postHandler);
 *   export const POST = withFeature([{ flag: RUNNERS, error: "..." }, { flag: MEMORY, error: "..." }], h);
 */
export function withFeature<C = unknown>(
  gate: FeatureGate | FeatureGate[],
  handler: RouteHandler<C>,
): RouteHandler<C> {
  const gates = Array.isArray(gate) ? gate : [gate];
  return async (request, ctx) => {
    for (const g of gates) {
      const blocked = await featureGateResponse(g);
      if (blocked) return blocked;
    }
    return handler(request, ctx);
  };
}
