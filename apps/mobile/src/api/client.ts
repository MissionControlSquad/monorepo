import { createClient, fetchExchange } from "urql";
import { getStoredCookie } from "./session";
import { API_URL } from "../config";

export const urqlClient = createClient({
  url: `${API_URL}/api/graphql`,
  exchanges: [fetchExchange],
  fetchOptions: () => {
    const cookie = getStoredCookie();
    return {
      headers: cookie ? { Cookie: `mc_session=${cookie}` } : {},
      credentials: "include",
    };
  },
});
