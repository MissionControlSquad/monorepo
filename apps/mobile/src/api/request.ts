/**
 * Authenticated REST request helper for the mobile app.
 *
 * Thin wrapper around the shared `makeRequest` from @agentcenter/utils that
 * injects the `mc_session` cookie header on every request.
 *
 * React Native's `fetch` ignores the `credentials` option entirely, so the
 * cookie must be injected manually via the `getCookie` option.
 */
export { ApiError } from "@agentcenter/utils";
export type { ApiRequestOptions as RequestOptions } from "@agentcenter/utils";
import { makeRequest as _makeRequest, ApiRequestOptions } from "@agentcenter/utils";
import { getStoredCookie } from "./session";

/**
 * Make an authenticated request to the MissionControl server.
 * Automatically injects the session cookie. Throws `ApiError` for non-2xx responses.
 */
export function makeRequest<T = unknown>(
  serverUrl: string,
  path: string,
  options: Omit<ApiRequestOptions, "getCookie"> = {},
): Promise<T> {
  return _makeRequest<T>(serverUrl, path, { ...options, getCookie: getStoredCookie });
}
