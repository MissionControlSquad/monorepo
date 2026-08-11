import { DEFAULT_WORKSPACE_ID } from "@/server/tenancy";
import { receivePluginWebhook, PluginWebhookError } from "@/server/services/plugin-webhooks";
import { successResponse, errorResponse } from "../../../../_lib/json-response";
import { apiLimiters, checkRateLimit } from "../../../../_lib/rate-limit-check";
import type { RouteContext as _RouteContext } from "../../../../_lib/route-context";

type RouteContext = _RouteContext<{ pluginId: string; hook: string }>;

// Inbound plugin webhook receiver (§3 plugins). External sender → this route → HMAC verify → enqueue a
// PluginJob for the worker. FAIL-CLOSED at every gate (see receivePluginWebhook). The workspace is NOT
// taken from a session (external caller); the sender is configured with the workspace id in the URL
// (?ws=) or the `x-agentcenter-workspace` header — identity is proven by the HMAC signature, not by the
// workspace id (which only selects the signing secret).
//
// HOW TO TEST:
//   sig=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
//   curl -XPOST "$HOST/api/plugins/<id>/webhooks/<hook>?ws=<workspaceId>" \
//     -H "x-plugin-signature: sha256=$sig" -H 'content-type: application/json' -d "$BODY"
//   → 202 { jobId } on a good signature; 401 on a bad/missing one.

export async function POST(request: Request, ctx: RouteContext) {
  try {
    // Rate-limit external callers first (cheapest gate; disabled under test).
    const limited = await checkRateLimit(apiLimiters.pluginWebhooks, request);
    if (limited) return limited;

    const { pluginId, hook } = await ctx.params;
    const url = new URL(request.url);
    const workspaceId =
      url.searchParams.get("ws") ??
      request.headers.get("x-agentcenter-workspace") ??
      DEFAULT_WORKSPACE_ID;

    // Read the RAW body — the signature is over the exact bytes, so we must not re-serialize.
    const rawBody = await request.text();
    const signature =
      request.headers.get("x-plugin-signature") ?? request.headers.get("x-hub-signature-256");
    const deliveryId =
      request.headers.get("x-plugin-delivery") ?? request.headers.get("x-delivery-id");

    // A minimal, non-sensitive header projection handed to the plugin.
    const headers: Record<string, string> = {};
    for (const key of ["content-type", "user-agent", "x-plugin-event"]) {
      const v = request.headers.get(key);
      if (v) headers[key] = v;
    }

    const result = await receivePluginWebhook({
      workspaceId,
      pluginId,
      hook,
      rawBody,
      signature,
      deliveryId,
      headers,
    });

    // 202 Accepted — the work is enqueued, not yet processed. Duplicate deliveries are idempotent 200s.
    return successResponse(result, result.duplicate ? 200 : 202);
  } catch (err) {
    if (err instanceof PluginWebhookError) return errorResponse(err.message, err.status, err.code);
    // Never leak internals on an unexpected failure.
    return errorResponse("Internal server error", 500, "INTERNAL_ERROR");
  }
}
