/**
 * @agentcenter/graphql-client-config
 *
 * Shared URQL GraphQL client factory. Provides the common configuration
 * (URL, auth, fetch options) used by all apps. Each app adds its own
 * exchanges (cache, subscriptions) on top.
 */

import { type Client, type Exchange, createClient, fetchExchange } from "urql";

export interface GraphQLClientOptions {
  /** Base URL of the server, e.g. "https://app.example.com" or "" for same-origin */
  baseUrl?: string;
  /** Returns auth headers/cookies to attach to every request */
  getAuthHeaders?: () => Record<string, string>;
  /** Additional URQL exchanges to prepend (e.g. cacheExchange, subscriptionExchange) */
  exchanges?: Exchange[];
}

/**
 * Create a configured URQL client.
 * Apps pass their own exchanges (cache, subscription) via `options.exchanges`.
 * This factory always appends `fetchExchange` last.
 */
export function createBaseGraphQLClient(options: GraphQLClientOptions = {}): Client {
  const { baseUrl = "", getAuthHeaders, exchanges = [] } = options;
  const url = `${baseUrl}/api/graphql`;

  return createClient({
    url,
    exchanges: [...exchanges, fetchExchange],
    fetchOptions: () => ({
      headers: getAuthHeaders?.() ?? {},
      credentials: "include",
    }),
  });
}
