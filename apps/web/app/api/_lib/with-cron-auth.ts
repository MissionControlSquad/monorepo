import { env } from "@/server/env";
import { errorResponse } from "./json-response";

/**
 * Gates a cron/internal route on the shared CRON_SECRET bearer — replaces the hand-copied
 * `const authHeader = request.headers.get("authorization"); if (!env.CRON_SECRET || authHeader !==
 * \`Bearer ${env.CRON_SECRET}\`) return 401` block across the cron routes. Fail-closed: a missing
 * CRON_SECRET (misconfig) rejects every request.
 *
 *   export const GET = withCronAuth(async (request) => { ...job... });
 */
export function withCronAuth<C = unknown>(
  handler: (request: Request, context: C) => Response | Promise<Response>,
) {
  return async (request: Request, context?: C): Promise<Response> => {
    const authHeader = request.headers.get("authorization");
    if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return errorResponse("Unauthorized", 401);
    }
    return handler(request, context as C);
  };
}
