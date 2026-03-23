/**
 * @agentcenter/graphql-client-config
 *
 * Server-Sent Events (SSE) subscription client for GraphQL subscriptions.
 * Works in both browser and React Native environments.
 */

export interface SSEClientOptions {
  /** Full URL of the GraphQL endpoint */
  url: string;
  /** Returns fetch options (headers, credentials) for each request */
  fetchOptions?: () => RequestInit;
}

/**
 * Creates a fetch-based SSE subscription forwarder compatible with
 * the `subscriptionExchange` from `@urql/core`.
 *
 * Usage with urql subscriptionExchange:
 * ```ts
 * import { subscriptionExchange } from "@urql/core";
 * import { createSSEForwarder } from "@agentcenter/graphql-client-config/sse-client";
 *
 * subscriptionExchange({
 *   forwardSubscription: createSSEForwarder({ url, fetchOptions }),
 * })
 * ```
 */
export function createSSEForwarder(options: SSEClientOptions) {
  return (operation: { query: string; variables?: Record<string, unknown> }) => ({
    subscribe: (observer: {
      next: (value: unknown) => void;
      error: (err: unknown) => void;
      complete: () => void;
    }) => {
      const controller = new AbortController();
      const { url, fetchOptions } = options;

      const fetchOpts = fetchOptions?.() ?? {};
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...(fetchOpts.headers as Record<string, string> | undefined),
      };

      fetch(url, {
        ...fetchOpts,
        method: "POST",
        headers,
        body: JSON.stringify({ query: operation.query, variables: operation.variables }),
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok || !res.body) {
            observer.error(new Error(`SSE connection failed: ${res.status}`));
            return;
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              observer.complete();
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  observer.next(data);
                } catch {
                  // ignore malformed SSE data
                }
              }
            }
          }
        })
        .catch((err) => {
          if (err?.name !== "AbortError") observer.error(err);
        });

      return {
        unsubscribe: () => controller.abort(),
      };
    },
  });
}
