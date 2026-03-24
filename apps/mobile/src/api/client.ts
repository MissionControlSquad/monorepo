import { createClient, fetchExchange, subscriptionExchange, mapExchange } from "urql";
import { createClient as createWsClient } from "graphql-ws";
import { getStoredCookie, getStoredServerUrl } from "./session";

/**
 * Create a URQL client pointing at the user's server URL.
 * Pass `serverUrl` explicitly to avoid relying on the async-saved store value.
 *
 * Cookie strategy:
 *   React Native's fetch ignores the `credentials` option (it is a web-only API).
 *   We inject the session cookie explicitly as a `Cookie` header on every request.
 *   On iOS, NSURLSession may also store it in the native cookie jar, but we do not
 *   rely on that — the explicit header is always the authoritative mechanism.
 *
 * 401 recovery:
 *   If the server returns 401 (expired/invalid session), `onUnauthenticated` is
 *   called so AuthContext can clear the session and redirect to the login screen.
 */
export function createUrqlClient(serverUrl?: string, onUnauthenticated?: () => void) {
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
      mapExchange({
        onError(error) {
          const is401 = error.response?.status === 401 ||
            error.graphQLErrors?.some((e) => e.extensions?.code === "UNAUTHENTICATED");
          if (is401 && onUnauthenticated) onUnauthenticated();
        },
      }),
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
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: `mc_session=${cookie}` } : {}),
        },
      };
    },
  });
}
