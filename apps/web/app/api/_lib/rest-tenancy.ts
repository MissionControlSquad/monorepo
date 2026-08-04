import { GraphQLError } from "graphql";
import { verifySessionToken, COOKIE_NAME } from "@/server/admin-auth";
import { resolveTenancy } from "@/server/tenancy";
import type { GraphQLContext } from "@/server/graphql/builder";
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
 * Map a service-thrown GraphQLError (BAD_USER_INPUT / NOT_FOUND) to the right REST status instead of a
 * blanket 500. Anything else falls through to handleError (which masks 5xx internals).
 */
export function serviceErrorResponse(err: unknown) {
  if (err instanceof GraphQLError) {
    const code = (err.extensions?.code as string) ?? "";
    if (code === "NOT_FOUND") return errorResponse(err.message, 404, code);
    if (code === "BAD_USER_INPUT" || code === "BAD_REQUEST") return errorResponse(err.message, 400, code);
  }
  return handleError(err);
}
