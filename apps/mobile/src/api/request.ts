/**
 * Authenticated REST request helper for the mobile app.
 *
 * Centralises:
 *  - Cookie injection  (`mc_session` header — required because React Native's
 *    `fetch` ignores the `credentials` option entirely)
 *  - Default headers   (Content-Type, x-request-id for server-side tracing)
 *  - Error parsing     (turns non-2xx responses into thrown Error objects)
 *
 * Usage:
 *   import { makeRequest } from "../api/request";
 *   const data = await makeRequest<{ vms: CloudVM[] }>(serverUrl, "/api/cloud-vms");
 */

import { getStoredCookie } from "./session";

function generateRequestId(): string {
  return `mob-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
}

/**
 * Make an authenticated request to the MissionControl server.
 * Throws `ApiError` for non-2xx responses.
 */
export async function makeRequest<T = unknown>(
  serverUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const cookie = getStoredCookie();
  const requestId = generateRequestId();

  const res = await fetch(`${serverUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      ...(cookie ? { Cookie: `mc_session=${cookie}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
      if (body.code) code = body.code;
    } catch {
      // ignore JSON parse failure
    }
    throw new ApiError(res.status, message, code);
  }

  return res.json() as Promise<T>;
}
