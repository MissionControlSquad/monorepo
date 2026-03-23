/**
 * @agentcenter/graphql-client-config
 *
 * Server-Sent Events (SSE) subscription client for GraphQL subscriptions.
 * Works in both browser and React Native environments.
 * Includes automatic reconnection with exponential backoff.
 */

export interface SSEClientOptions {
  /** Full URL of the GraphQL endpoint */
  url: string;
  /** Returns fetch options (headers, credentials) for each request */
  fetchOptions?: () => RequestInit;
  /** Maximum number of reconnection attempts (default: 5) */
  maxRetries?: number;
  /** Initial retry delay in ms (default: 1000). Doubles on each retry. */
  initialRetryDelayMs?: number;
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
  const { maxRetries = 5, initialRetryDelayMs = 1000 } = options;

  return (operation: { query: string; variables?: Record<string, unknown> }) => ({
    subscribe: (observer: {
      next: (value: unknown) => void;
      error: (err: unknown) => void;
      complete: () => void;
    }) => {
      let aborted = false;
      let retryCount = 0;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      const controller = new AbortController();

      function connect() {
        if (aborted) return;

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
              throw new Error(`SSE connection failed: ${res.status}`);
            }

            // Connection succeeded — reset retry counter
            retryCount = 0;

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                // Stream ended normally — attempt reconnect unless explicitly aborted
                if (!aborted) {
                  scheduleRetry();
                } else {
                  observer.complete();
                }
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
                  } catch (e) {
                    console.warn("[SSE] Malformed data frame:", (e as Error).message);
                  }
                }
              }
            }
          })
          .catch((err) => {
            if (aborted || err?.name === "AbortError") return;
            scheduleRetry();
          });
      }

      function scheduleRetry() {
        if (aborted) return;
        if (retryCount >= maxRetries) {
          observer.error(new Error(`SSE reconnection failed after ${maxRetries} attempts`));
          return;
        }
        const delay = initialRetryDelayMs * Math.pow(2, retryCount);
        retryCount++;
        retryTimer = setTimeout(connect, delay);
      }

      // Start initial connection
      connect();

      return {
        unsubscribe: () => {
          aborted = true;
          if (retryTimer) clearTimeout(retryTimer);
          controller.abort();
        },
      };
    },
  });
}
