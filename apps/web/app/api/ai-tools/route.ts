import { successResponse, errorResponse, handleError } from "../_lib/json-response";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import { detectLocalRuntimes } from "@/server/services/ai-runtime-detect";

// Uses node:child_process to probe the host - force the Node runtime (never edge).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ai-tools
 *
 * The control-plane host's own AI-CLI inventory (installed vs missing + per-OS install help). Plain
 * JSON, AI_TOOLS-gated. Detection runs the pure catalog's bin names (never user input) so it is
 * injection-safe. An `?os=` query previews another OS's install commands without changing detection.
 */
export async function GET(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.AI_TOOLS)))
      return errorResponse("AI Tools is not enabled", 403, "FEATURE_DISABLED");
    const os = new URL(request.url).searchParams.get("os") ?? undefined;
    const inventory = await detectLocalRuntimes(
      os === "macos" || os === "linux" || os === "windows" ? os : undefined,
    );
    return successResponse(inventory);
  } catch (err) {
    return handleError(err);
  }
}
