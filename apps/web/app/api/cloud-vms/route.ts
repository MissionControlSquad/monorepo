import { listCloudVMs } from "@agentcenter/database";
import { createCloudVM } from "@/server/services/cloud-vm";
import { successResponse, errorResponse, handleError } from "../_lib/json-response";
import { validateBody, createCloudVMSchema } from "../_lib/validation";
import { apiLimiters, checkRateLimit } from "../_lib/rate-limit-check";
import { resolveSession } from "../_lib/resolve-session";
import { withFeature } from "../_lib/with-feature";
import { FLAG_KEYS } from "@agentcenter/utils";

/**
 * GET /api/cloud-vms
 * List all VMs (excludes destroyed).
 */
export async function GET(request: Request) {
  try {
    await resolveSession(request);

    const limited = await checkRateLimit(apiLimiters.cloudVms, request);
    if (limited) return limited;

    const vms = await listCloudVMs();

    return successResponse({ vms });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/cloud-vms
 * Create (provision) a new managed Hetzner VM. Body: { name?, region?, serverType? }
 *
 * DEPRECATED: operator-managed cloud VMs are deprecated — all infrastructure is now bring-your-own
 * (BYO runner daemon / registered SSH host / BYO sandbox providers). This provisioning entry point is
 * gated behind the default-off CLOUD_VMS flag so no new managed infra is created; the code is retained
 * for reversibility. See docs/RUNNER-ARCHITECTURE.md.
 */
async function postHandler(request: Request) {
  const limited = await checkRateLimit(apiLimiters.cloudVms, request);
  if (limited) return limited;

  try {
    const parsed = await validateBody(request, createCloudVMSchema);
    if (parsed.error) return parsed.error;
    const { name, region, serverType } = parsed.data;

    const result = await createCloudVM({ name, region, serverType });

    return successResponse(result, 201);
  } catch (err) {
    if (err instanceof Error && err.message.includes("Maximum")) {
      return errorResponse(err.message, 429);
    }
    return handleError(err);
  }
}

export const POST = withFeature(FLAG_KEYS.CLOUD_VMS, postHandler);
