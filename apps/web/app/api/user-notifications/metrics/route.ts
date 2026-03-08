export const dynamic = "force-dynamic";

import { resolveUserId } from "../../_lib/resolve-session";
import { successResponse, handleError } from "../../_lib/json-response";
import { getMetrics } from "@/server/services/notification-metrics";

export async function GET(request: Request) {
  try {
    await resolveUserId(request);
    return successResponse(getMetrics());
  } catch (err) {
    return handleError(err);
  }
}
