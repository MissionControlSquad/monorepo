/**
 * Platform-agnostic network utility functions.
 * Works in browser, Node.js, and React Native (all support fetch + AbortController).
 */

/**
 * Pings `serverUrl/api/health` with a 4-second timeout.
 * Returns `true` if the server responds with a non-500 status.
 *
 * @example
 * const online = await checkNetworkHealth("https://my.server.com");
 */
export async function checkNetworkHealth(
  serverUrl: string,
  timeoutMs: number = 4000,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(`${serverUrl}/api/health`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}
