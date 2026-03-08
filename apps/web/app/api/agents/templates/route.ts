import { AGENT_TEMPLATES } from "@/server/agent-templates";
import { cachedJsonResponse, CachePreset } from "../../_lib/cache-headers";

/**
 * GET /api/agents/templates
 * Returns all available agent templates.
 */
export async function GET() {
  return cachedJsonResponse(AGENT_TEMPLATES, CachePreset.immutable);
}
