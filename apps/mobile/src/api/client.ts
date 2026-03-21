import { createClient, fetchExchange } from "urql";
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

  return createClient({
    url: `${url}/api/graphql`,
    exchanges: [fetchExchange],
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
