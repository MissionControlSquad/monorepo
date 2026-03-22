import { createClient, fetchExchange, subscriptionExchange } from "urql";
import { createClient as createWsClient } from "graphql-ws";
import { getStoredCookie, getStoredServerUrl } from "./session";

/**
 * Create a URQL client pointing at the user's server URL.
 * Pass `serverUrl` explicitly to avoid relying on the async-saved store value.
 *
 * Cookie strategy (iOS):
 *   iOS NSURLSession stores Set-Cookie internally and strips it from JS headers.
 *   We therefore rely on `credentials: "include"` so the native cookie jar
 *   attaches the session cookie automatically. If the cookie is available in
 *   the in-memory store (Android / manual extraction), we also set it explicitly
 *   as a fallback header so both paths work.
 */
export function createUrqlClient(serverUrl?: string) {
  const url = serverUrl ?? getStoredServerUrl() ?? "http://localhost:3000";
  const wsUrl = url.replace(/^http/, "ws") + "/api/graphql";

  const wsClient = createWsClient({
    url: wsUrl,
    connectionParams: () => {
      const cookie = getStoredCookie();
      return cookie ? { Cookie: `mc_session=${cookie}` } : {};
    },
    shouldRetry: () => true,
    retryAttempts: Infinity,
  });

  return createClient({
    url: `${url}/api/graphql`,
    exchanges: [
      fetchExchange,
      subscriptionExchange({
        forwardSubscription(request) {
          const input = { ...request, query: request.query ?? "" };
          return {
            subscribe(sink) {
              const unsubscribe = wsClient.subscribe(input, sink);
              return { unsubscribe };
            },
          };
        },
      }),
    ],
    fetchOptions: () => {
      const cookie = getStoredCookie();
      return {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: `mc_session=${cookie}` } : {}),
        },
      };
    },
  });
}
