export const dynamic = "force-dynamic";

import { prisma } from "@/server/prisma";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { createRateLimiter } from "@/server/rate-limit";
import { triggerRoutineNow } from "@/server/services/routines";
import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";

/**
 * POST /api/routines/fire/:publicId
 *
 * Public, session-less webhook that fires a routine's `webhook` trigger by its nanoid `publicId`
 * (the URL the routines UI advertises). No auth cookie/key — the unguessable publicId IS the secret,
 * and it can be rotated (regenerateTriggerPublicId). Rate-limited per IP+publicId so a leaked URL
 * can't be used to hammer the run/task machinery.
 *
 * Security: returns the SAME 404 whether the trigger is missing, not a webhook, disabled, its routine
 * is inactive, or the feature is off — so the endpoint never confirms which publicIds are valid.
 */
const limiter = createRateLimiter({ max: 30, windowSec: 60, prefix: "routine-fire" });

export async function POST(request: Request, ctx: { params: Promise<{ publicId: string }> }) {
  try {
    const { publicId } = await ctx.params;
    if (!publicId) return errorResponse("Not found", 404, "NOT_FOUND");

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const rl = await limiter.checkAsync(`${ip}:${publicId}`);
    if (!rl.allowed) {
      return errorResponse(`Rate limit exceeded, retry in ${rl.retryAfterSec}s`, 429, "RATE_LIMITED");
    }

    const trigger = await prisma.routineTrigger.findUnique({
      where: { publicId },
      include: { routine: { select: { id: true, workspaceId: true, isActive: true } } },
    });

    // Every failure mode collapses to one opaque 404 (see security note above).
    const usable =
      trigger &&
      trigger.type === "webhook" &&
      trigger.isEnabled &&
      trigger.routine.isActive &&
      (await isFeatureEnabled(FLAG_KEYS.PIPELINES_ROUTINES));
    if (!usable) return errorResponse("Not found", 404, "NOT_FOUND");

    const run = await triggerRoutineNow({
      workspaceId: trigger.routine.workspaceId,
      routineId: trigger.routine.id,
      triggeredBy: "webhook",
      triggerId: trigger.id,
    });

    return successResponse(
      { runId: run.id, status: run.status, generatedTaskId: run.generatedTaskId ?? null },
      run.status === "failed" ? 500 : 200,
    );
  } catch (err) {
    return handleError(err);
  }
}
