import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { isFeatureEnabled } from "@/server/feature-flags";
import { FLAG_KEYS } from "@agentcenter/utils";
import {
  verifyRunBridgeToken,
  bridgeMemoryNote,
  bridgeMemorySearch,
  bridgeMemoryForget,
} from "@/server/services/run-bridge";

/**
 * POST /api/runner/bridge/memory
 *
 * The in-sandbox agent memory tools (memory.note / memory.search / memory.forget), invocable mid-run.
 * An agent running INSIDE a sandbox reads and writes its OWN memory using the run-scoped token in its
 * env (AGENTCENTER_RUN_TOKEN). Least-privilege: the token fixes the workspace + agent scope, so an
 * agent can only ever touch its own memory - no client-supplied ids are trusted for scoping. MEMORY-
 * and RUNNERS-gated. Routes through the MemoryAdapter registry (the default `db` adapter).
 *
 *   Authorization: Bearer rbt_<token>
 *   { "op": "note",   "content": "..." }              -> { id }
 *   { "op": "search", "query": "...", "limit": 20 }   -> { results: [{ id, content, createdAt }] }
 *   { "op": "forget", "memoryId": "..." }             -> { forgotten: true|false }
 */
export async function POST(request: Request) {
  try {
    if (!(await isFeatureEnabled(FLAG_KEYS.RUNNERS))) {
      return errorResponse("Runners are not enabled", 403, "FEATURE_DISABLED");
    }
    if (!(await isFeatureEnabled(FLAG_KEYS.MEMORY))) {
      return errorResponse("Memory is not enabled", 403, "FEATURE_DISABLED");
    }
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const run = await verifyRunBridgeToken(token);
    if (!run) return errorResponse("Invalid or expired run token", 401, "UNAUTHORIZED");

    const body = (await request.json().catch(() => ({}))) as {
      op?: unknown;
      content?: unknown;
      query?: unknown;
      limit?: unknown;
      memoryId?: unknown;
    };
    const op = typeof body.op === "string" ? body.op : "";

    if (op === "note") {
      const content = typeof body.content === "string" ? body.content : "";
      const entry = await bridgeMemoryNote(run, content);
      if (!entry) {
        return errorResponse("Nothing to note (empty content or memory unavailable for run)", 400);
      }
      return successResponse({ ok: true, id: entry.id }, 201);
    }

    if (op === "search") {
      const query = typeof body.query === "string" ? body.query : "";
      const limit = typeof body.limit === "number" ? body.limit : undefined;
      const results = await bridgeMemorySearch(run, query, limit);
      if (results === null) return errorResponse("Memory unavailable for run", 400);
      return successResponse({ ok: true, results });
    }

    if (op === "forget") {
      const memoryId = typeof body.memoryId === "string" ? body.memoryId : "";
      if (!memoryId.trim()) return errorResponse("memoryId is required", 400);
      const forgotten = await bridgeMemoryForget(run, memoryId);
      if (forgotten === null) return errorResponse("Memory unavailable for run", 400);
      return successResponse({ ok: true, forgotten });
    }

    return errorResponse("Unknown op (expected note | search | forget)", 400);
  } catch (err) {
    return handleError(err);
  }
}
