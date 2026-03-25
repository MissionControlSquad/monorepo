/**
 * Shared authenticated REST request helper.
 *
 * Platform-agnostic: works on web, mobile (React Native), and Electron.
 *
 * Cookie strategy per platform:
 *   - Web/Electron: browser sends cookies automatically via `credentials: "include"`.
 *     Pass no `getCookie` option — the default fetch behavior handles it.
 *   - React Native: `credentials` is ignored; pass `getCookie` to inject the
 *     `mc_session` value as an explicit `Cookie` header on every request.
 */

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

export interface ApiRequestOptions extends Omit<RequestInit, "headers"> {
  headers?: Record<string, string>;
  /** Optional: supply the session cookie value to inject as a Cookie header (React Native). */
  getCookie?: () => string | null;
}

function generateRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Make an authenticated request to the MissionControl server.
 * Throws `ApiError` for non-2xx responses.
 */
export async function makeRequest<T = unknown>(
  serverUrl: string,
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const { getCookie, headers: extraHeaders, ...fetchOptions } = options;
  const cookie = getCookie?.();
  const requestId = generateRequestId();

  const res = await fetch(`${serverUrl}${path}`, {
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
      ...(cookie ? { Cookie: `mc_session=${cookie}` } : {}),
      ...extraHeaders,
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
      // ignore JSON parse failure — use the default message
    }
    throw new ApiError(res.status, message, code);
  }

  return res.json() as Promise<T>;
}
