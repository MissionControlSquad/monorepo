import { isFeatureEnabled } from "@/server/feature-flags";
import { errorResponse } from "./json-response";
import type { FlagKey } from "@agentcenter/utils";

/**
 * Feature gate for a route/HOC: a bare flag uses the standard "This feature is not enabled on your plan"
 * / FEATURE_DISABLED 403, or `{ flag, error, code }` to preserve a route's own message/code. Shared by
 * withAgent and withTenancy so the gate lives in exactly one place.
 */
export type FeatureGate = FlagKey | { flag: FlagKey; error?: string; code?: string };

/** Returns a 403 Response when the gate's flag is off, else null (proceed). */
export async function featureGateResponse(gate: FeatureGate | undefined): Promise<Response | null> {
  if (!gate) return null;
  const spec = typeof gate === "string" ? { flag: gate } : gate;
  if (!(await isFeatureEnabled(spec.flag))) {
    return errorResponse(
      spec.error ?? "This feature is not enabled on your plan",
      403,
      spec.code ?? "FEATURE_DISABLED",
    );
  }
  return null;
}
