import { listCloudVMs } from "@agentcenter/database";
import { createCloudVM } from "@/server/services/cloud-vm";
import { successResponse, errorResponse, handleError } from "../_lib/json-response";
import { validateBody, createCloudVMSchema } from "../_lib/validation";
import { apiLimiters, checkRateLimit } from "../_lib/rate-limit-check";

/**
 * GET /api/cloud-vms
 * List all VMs (excludes destroyed).
 */
export async function GET() {
  try {
    const vms = await listCloudVMs();

    return successResponse({ vms });
  } catch (err) {
    return handleError(err);
  }
}

/**
 * POST /api/cloud-vms
 * Create a new VM.
 * Body: { name?, region?, serverType? }
 */
export async function POST(request: Request) {
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
