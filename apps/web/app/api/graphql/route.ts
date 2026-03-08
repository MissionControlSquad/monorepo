import { createYoga } from "graphql-yoga";
import { schema } from "@/server/graphql/schema";
import { prisma } from "@/server/prisma";
import type { GraphQLContext } from "@/server/graphql/builder";
import { verifySessionToken, COOKIE_NAME } from "@/server/admin-auth";
import { apiLimiters, checkRateLimit } from "../_lib/rate-limit-check";

function getSessionTokenFromRequest(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1].trim() : null;
}

const yoga = createYoga<GraphQLContext>({
  schema,
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
    return { prisma, session };
  },
  graphqlEndpoint: "/api/graphql",
  fetchAPI: { Response },
  // Enable GraphiQL playground in development
  graphiql: process.env.NODE_ENV !== "production",
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

function withRateLimit(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    const limited = await checkRateLimit(apiLimiters.graphql, req);
    if (limited) return limited;
    return handler(req);
  };
}

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = withRateLimit(yogaHandler);
export const POST = withRateLimit(yogaHandler);
