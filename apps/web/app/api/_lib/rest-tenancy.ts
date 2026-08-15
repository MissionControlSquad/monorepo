import { GraphQLError } from "graphql";
import { verifySessionToken, COOKIE_NAME } from "@/server/admin-auth";
import { resolveTenancy, roleAtLeast } from "@/server/tenancy";
import type { GraphQLContext } from "@/server/graphql/builder";
import type { TenancyContext, WorkspaceRole } from "@agentcenter/graphql-server";
import { errorResponse, handleError } from "./json-response";

/**
 * Resolve human/agent tenancy for a REST route exactly the way the GraphQL context builder does:
 * session cookie → buildbase workspace token → agent API key. Returns null when unauthenticated so the
 * caller can 401. Gives REST parity with GraphQL for workspace scoping + role checks.
 */
export async function resolveRestTenancy(request: Request) {
  const cookie = request.headers.get("cookie");
  let session: GraphQLContext["session"] = null;
  if (cookie) {
    const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    if (match) {
      const payload = await verifySessionToken(match[1].trim());
      if (payload?.profileId) {
        session = { sub: payload.sub, username: payload.username, profileId: payload.profileId };
      }
    }
  }
  return resolveTenancy(session, cookie, request.headers.get("authorization"));
}

/**
 * HOC that gates a REST route handler with human/agent auth so routes stop repeating the
 * `resolveRestTenancy → 401 → roleAtLeast → 403` boilerplate. It resolves tenancy (401 if none),
 * optionally enforces a minimum workspace role (403), and hands the verified TenancyContext to the
 * handler. Preserves the Next.js route-handler signature `(request, context)` so dynamic-route params
 * still flow through as the third arg.
 *
 *   export const DELETE = withTenancy(
 *     async (request, tenancy, { params }) => { ...use tenancy.workspaceId... },
 *     { minRole: WORKSPACE_ROLES.ADMIN },
 *   );
 */
export function withTenancy<C = unknown>(
  handler: (request: Request, tenancy: TenancyContext, context: C) => Response | Promise<Response>,
  opts: { minRole?: WorkspaceRole } = {},
) {
  // `context` is optional: Next passes `{ params }` for dynamic routes but omits it for static ones, so
  // the wrapped export must be callable with 1 or 2 args.
  return async (request: Request, context?: C): Promise<Response> => {
    const tenancy = await resolveRestTenancy(request);
    if (!tenancy) return errorResponse("Unauthorized", 401, "UNAUTHENTICATED");
    if (opts.minRole && !roleAtLeast(tenancy.role, opts.minRole)) {
      return errorResponse("Forbidden", 403, "FORBIDDEN");
    }
    return handler(request, tenancy, context as C);
  };
}

/**
 * Map a service-thrown GraphQLError (BAD_USER_INPUT / NOT_FOUND) to the right REST status instead of a
 * blanket 500. Anything else falls through to handleError (which masks 5xx internals).
 */
export function serviceErrorResponse(err: unknown) {
  if (err instanceof GraphQLError) {
    const code = (err.extensions?.code as string) ?? "";
    if (code === "NOT_FOUND") return errorResponse(err.message, 404, code);
    if (code === "BAD_USER_INPUT" || code === "BAD_REQUEST")
      return errorResponse(err.message, 400, code);
  }
  return handleError(err);
}
