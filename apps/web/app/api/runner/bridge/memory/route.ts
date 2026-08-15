import { successResponse, errorResponse, handleError } from "../../../_lib/json-response";
import { withFeature } from "../../../_lib/with-feature";
import { FLAG_KEYS } from "@agentcenter/utils";
import {
  verifyRunBridgeToken,
  bridgeMemoryNote,
  bridgeMemorySearch,
  bridgeMemoryForget,
  bridgeMemoryCorrect,
  bridgeMemoryList,
  bridgeMemoryRecordUpsert,
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
 *   { "op": "note",          "content": "..." }                    -> { id }
 *   { "op": "search",        "query": "...", "limit": 20 }         -> { results: [{ id, content, createdAt }] }
 *   { "op": "forget",        "memoryId": "..." }                   -> { forgotten: true|false }
 *   { "op": "correct",       "memoryId": "...", "content": "..." } -> { id }            (supersede + rewrite)
 *   { "op": "list",          "limit": 20, "offset": 0 }           -> { results: [...], nextOffset }
 *   { "op": "record_upsert", "key": "...", "content": "..." }      -> { id, created }   (idempotent by key)
 */
export const POST = withFeature(
  [
    { flag: FLAG_KEYS.RUNNERS, error: "Runners are not enabled" },
    { flag: FLAG_KEYS.MEMORY, error: "Memory is not enabled" },
  ],
  postHandler,
);

async function postHandler(request: Request) {
  try {
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    const run = await verifyRunBridgeToken(token);
    if (!run) return errorResponse("Invalid or expired run token", 401, "UNAUTHORIZED");

    const body = (await request.json().catch(() => ({}))) as {
      op?: unknown;
      content?: unknown;
      query?: unknown;
      limit?: unknown;
      offset?: unknown;
      memoryId?: unknown;
      key?: unknown;
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

    if (op === "correct") {
      const memoryId = typeof body.memoryId === "string" ? body.memoryId : "";
      const content = typeof body.content === "string" ? body.content : "";
      if (!memoryId.trim()) return errorResponse("memoryId is required", 400);
      if (!content.trim()) return errorResponse("content is required", 400);
      const entry = await bridgeMemoryCorrect(run, memoryId, content);
      if (!entry) {
        return errorResponse(
          "Nothing corrected (entry not found, already corrected, or memory unavailable for run)",
          400,
        );
      }
      return successResponse({ ok: true, id: entry.id }, 201);
    }

    if (op === "list") {
      const limit = typeof body.limit === "number" ? body.limit : undefined;
      const offset = typeof body.offset === "number" ? body.offset : undefined;
      const page = await bridgeMemoryList(run, { limit, offset });
      if (page === null) return errorResponse("Memory unavailable for run", 400);
      return successResponse({ ok: true, results: page.results, nextOffset: page.nextOffset });
    }

    if (op === "record_upsert") {
      const key = typeof body.key === "string" ? body.key : "";
      const content = typeof body.content === "string" ? body.content : "";
      if (!key.trim()) return errorResponse("key is required", 400);
      if (!content.trim()) return errorResponse("content is required", 400);
      const res = await bridgeMemoryRecordUpsert(run, key, content);
      if (!res) {
        return errorResponse("Nothing upserted (empty input or memory unavailable for run)", 400);
      }
      return successResponse(
        { ok: true, id: res.id, created: res.created },
        res.created ? 201 : 200,
      );
    }

    return errorResponse(
      "Unknown op (expected note | search | forget | correct | list | record_upsert)",
      400,
    );
  } catch (err) {
    return handleError(err);
  }
}
