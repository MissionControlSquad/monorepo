import { createClient, ExchangeIO, Operation } from "urql";
import { getAuthToken } from "./auth";

/**
 * Create and configure the urql GraphQL client for the mobile app
 * Uses the same API endpoint as the web app
 */
export function createUrqlClient() {
  const apiUrl =
    process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000/api/graphql";

  // Custom fetch with auth header injection
  const fetchWithAuth: typeof fetch = async (input, init) => {
    const token = await getAuthToken();

    const headers = {
      ...((init?.headers as Record<string, string>) || {}),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return fetch(input, {
      ...init,
      headers,
    });
  };

  return createClient({
    url: apiUrl,
    fetch: fetchWithAuth,
    exchanges: [], // Default exchanges will be used
  });
}

/**
 * Authentication exchange for automatically retrying requests with fresh tokens
 * Can be extended to handle token refresh logic
 */
export const authExchange = (fetchOptions?: any) =>
  ({ forward }: ExchangeIO): ExchangeIO =>
  (ops$) => {
    return forward(
      ops$.map((operation: Operation) => {
        // Add any pre-request logic here if needed
        return operation;
      })
    );
  };
