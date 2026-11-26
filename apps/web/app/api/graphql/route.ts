import { createYoga } from "@agentcenter/graphql-server";
import { schema } from "@/server/graphql/schema";
import { prisma } from "@/server/prisma";
import type { GraphQLContext } from "@/server/graphql/builder";
import { verifySessionToken, COOKIE_NAME } from "@/server/admin-auth";
import { resolveTenancy } from "@/server/tenancy";
import { apiLimiters, checkRateLimit } from "../_lib/rate-limit-check";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/** Maximum allowed query depth to prevent deeply nested DoS queries. */
const MAX_QUERY_DEPTH = 12;

function getSessionTokenFromRequest(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1].trim() : null;
}

const yoga = createYoga<GraphQLContext>({
  schema,
  // Disable introspection in production to prevent schema leaking
  parserAndValidationCache: !IS_PRODUCTION,
  context: async ({ request }) => {
    const token = getSessionTokenFromRequest(request);
    let session: GraphQLContext["session"] = null;
    if (token) {
      const payload = await verifySessionToken(token);
      if (payload?.profileId) {
        session = {
          sub: payload.sub,
          username: payload.username,
          profileId: payload.profileId,
        };
      }
    }
    return {
      prisma,
      session,
      tenancy: await resolveTenancy(
        session,
        request.headers.get("cookie"),
        request.headers.get("authorization"),
      ),
    };
  },
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
  // Disable GraphiQL and schema introspection in production
  graphiql: !IS_PRODUCTION,
  // Suppress noisy ResponseAborted errors from SSE client disconnects
  logging: {
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error(...args: any[]) {
      for (const arg of args) {
        if (arg instanceof Error) {
          const name = arg.name || arg.constructor?.name || "";
          if (name === "ResponseAborted" || arg.message?.includes("ResponseAborted")) return;
        }
        if (typeof arg === "string" && arg.includes("ResponseAborted")) return;
      }
      console.error(...args);
    },
  },
});

const yogaHandler = yoga as unknown as (req: Request) => Promise<Response>;

/**
 * Estimate query depth from the raw query string.
 * Counts nested selection set braces as a proxy for depth.
 */
function estimateQueryDepth(query: string): number {
  let depth = 0;
  let maxDepth = 0;
  for (const ch of query) {
    if (ch === "{") {
      depth++;
      if (depth > maxDepth) maxDepth = depth;
    } else if (ch === "}") {
      depth--;
    }
  }
  return maxDepth;
}

function withRateLimit(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    const limited = await checkRateLimit(apiLimiters.graphql, req);
    if (limited) return limited;

    // Query depth check — prevent deeply nested DoS queries
    if (req.method === "POST") {
      try {
        const cloned = req.clone();
        const body = await cloned.json();
        const query = body?.query;
        if (typeof query === "string") {
          // Block introspection in production
          if (IS_PRODUCTION && query.includes("__schema")) {
            return Response.json(
              { errors: [{ message: "Introspection is disabled" }] },
              { status: 400 },
            );
          }
          if (estimateQueryDepth(query) > MAX_QUERY_DEPTH) {
            return Response.json(
              { errors: [{ message: "Query depth exceeds maximum allowed depth" }] },
              { status: 400 },
            );
          }
        }
      } catch {
        // If body parsing fails, let Yoga handle the error
      }
    }

    return handler(req);
  };
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = withRateLimit(yogaHandler);
export const POST = withRateLimit(yogaHandler);
