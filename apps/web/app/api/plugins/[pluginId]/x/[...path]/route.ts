import { withTenancy } from "../../../../_lib/rest-tenancy";
import { successResponse, errorResponse } from "../../../../_lib/json-response";
import {
  dispatchPluginApiRoute,
  PluginApiRouteError,
  type HttpMethod,
} from "@/server/services/plugin-api-routes";

// A catch-all route param (`path`) is a string[], which the shared RouteContext<Record<string,string>>
// helper cannot express — so the context type is declared inline here.
type RouteContext = { params: Promise<{ pluginId: string; path: string[] }> };

// Scoped plugin API routes (§3 plugins). A plugin declares `apiRoutes`; the host mounts them under
// /api/plugins/<id>/x/<...path> and DISPATCHES into the plugin worker, capability-checked + fail-closed
// (see dispatchPluginApiRoute). The workspace comes from the caller's tenancy (session cookie / bb token
// / agent API key) — NEVER from client input.
//
// HOW TO TEST:
//   curl "$HOST/api/plugins/<id>/x/status" -H "cookie: <session>"          # → declared GET route
//   curl -XPOST "$HOST/api/plugins/<id>/x/echo" -H '...' -d '{"a":1}'      # → declared POST route
//   Ungranted (route.capability not granted) → 403 CAPABILITY_DENIED; undeclared path → 404.

// Auth (session cookie / bb token / agent API key → 401) is handled by withTenancy; any authenticated
// tenancy may reach a plugin's declared routes (capability is enforced per-route inside dispatch).
const handle = (method: HttpMethod) =>
  withTenancy<RouteContext>(async (request, tenancy, ctx) => {
    try {
      const { pluginId, path } = await ctx.params;
      const subPath = "/" + (path ?? []).join("/");

      const url = new URL(request.url);
      const query: Record<string, string> = {};
      url.searchParams.forEach((v, k) => (query[k] = v));

      let body: unknown = null;
      if (method !== "GET") {
        const text = await request.text();
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            body = text;
          }
        }
      }

      const result = await dispatchPluginApiRoute({
        workspaceId: tenancy.workspaceId,
        pluginId,
        method,
        path: subPath,
        query,
        body,
        headers: { "content-type": request.headers.get("content-type") ?? "" },
      });
      return successResponse({ result });
    } catch (err) {
      if (err instanceof PluginApiRouteError)
        return errorResponse(err.message, err.status, err.code);
      // A registry-only plugin with no runtime entrypoint (or a worker error) surfaces here — keep the
      // message generic (may reference internal paths) but signal it is a dispatch failure.
      return errorResponse("Plugin route dispatch failed", 502, "DISPATCH_FAILED");
    }
  });

export const GET = handle("GET");
export const POST = handle("POST");
export const PUT = handle("PUT");
export const PATCH = handle("PATCH");
export const DELETE = handle("DELETE");
