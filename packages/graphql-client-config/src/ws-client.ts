/**
 * WebSocket subscription forwarder for GraphQL subscriptions via graphql-ws.
 * Works in both browser and React Native environments.
 */

import { createClient, type ClientOptions } from "graphql-ws";

export interface WSClientOptions {
  /** Full WebSocket URL of the GraphQL endpoint (ws:// or wss://) */
  url: string | (() => string);
  /** Optional connection params sent on initial handshake (e.g. auth tokens) */
  connectionParams?: ClientOptions["connectionParams"];
}

/**
 * Creates a graphql-ws powered subscription forwarder compatible with
 * the `subscriptionExchange` from `@urql/core`.
 */
export function createWSForwarder(options: WSClientOptions) {
  const wsClient = createClient({
    url: options.url,
    connectionParams: options.connectionParams,
    retryAttempts: Infinity,
    retryWait: async (retryCount) => {
      const baseDelay = Math.min(1000 * Math.pow(2, retryCount), 30000);
      const jitter = Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, baseDelay + jitter));
    },
  });

  return (operation: { query: string; variables?: Record<string, unknown> }) => ({
    subscribe: (observer: {
      next: (value: unknown) => void;
      error: (err: unknown) => void;
      complete: () => void;
    }) => {
      const dispose = wsClient.subscribe(
        { query: operation.query, variables: operation.variables },
        observer,
      );
      return { unsubscribe: dispose };
    },
  });
}
