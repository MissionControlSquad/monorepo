import { createClient, fetchExchange } from "urql";
import { getStoredCookie, getStoredServerUrl } from "./session";

/**
 * Create a URQL client pointing at the user's server URL.
 * Called once after session is loaded (server URL is known).
 */
export function createUrqlClient() {
  const serverUrl = getStoredServerUrl() ?? "http://localhost:3000";

  return createClient({
    url: `${serverUrl}/api/graphql`,
    exchanges: [fetchExchange],
    fetchOptions: () => {
      const cookie = getStoredCookie();
      return {
        headers: cookie ? { Cookie: `mc_session=${cookie}` } : {},
        credentials: "include",
      };
    },
  });
}
