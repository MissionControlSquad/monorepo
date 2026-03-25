/**
 * Lightweight REST helpers for the AgentCenter server API.
 * All functions accept `serverUrl`:
 *   - Mobile/Electron: pass full URL, e.g. "https://my.server.com"
 *   - Web (Next.js same-origin): pass ""
 *
 * `extraHeaders` is optional and intended for React Native where the
 * native cookie jar may not forward the session cookie automatically.
 */

/** Returns true if url begins with http:// or https://. */
export function isValidServerUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/** Normalize a server URL: strip trailing slashes. */
export function normalizeServerUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Check whether the server has completed first-time setup. */
export async function checkServerSetup(
  serverUrl: string,
  extraHeaders?: Record<string, string>,
): Promise<{ setupComplete: boolean }> {
  const res = await fetch(`${normalizeServerUrl(serverUrl)}/api/auth/status`, {
    headers: extraHeaders,
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const data = await res.json();
  return { setupComplete: data.setupComplete !== false };
}

/** Fetch the current license status from the server. */
export async function fetchLicenseStatus(
  serverUrl: string,
  extraHeaders?: Record<string, string>,
): Promise<{ status: string }> {
  const res = await fetch(`${normalizeServerUrl(serverUrl)}/api/license`, {
    credentials: "include",
    headers: extraHeaders,
  });
  const data = await res.json();
  return { status: (data.status as string) ?? "active" };
}

/** Fetch the onboarding completion status from the server. */
export async function fetchOnboardingStatus(
  serverUrl: string,
  extraHeaders?: Record<string, string>,
): Promise<{ completed?: boolean; categoryId?: string | null }> {
  const res = await fetch(`${normalizeServerUrl(serverUrl)}/api/onboarding`, {
    credentials: "include",
    headers: extraHeaders,
  });
  return res.json() as Promise<{ completed?: boolean; categoryId?: string | null }>;
}

/**
 * Extract the mc_session cookie value from a raw Set-Cookie header string.
 * Returns an empty string when the cookie is not present (e.g. iOS native
 * cookie jar strips it from JS-visible headers — the cookie is still stored
 * internally and attached automatically via `credentials: "include"`).
 */
export function extractMcSessionCookie(setCookieHeader: string): string {
  return setCookieHeader.match(/mc_session=([^;]+)/)?.[1] ?? "";
}

/**
 * Authenticate against the AgentCenter server with username + password.
 * Returns the resolved profileId, username, and extracted session cookie.
 *
 * Storage is intentionally NOT handled here — callers are responsible for
 * persisting the session (e.g. SecureStore on mobile, cookie jar on web).
 */
export async function loginWithCredentials(
  serverUrl: string,
  username: string,
  password: string,
): Promise<{ profileId: string; username: string; cookie: string }> {
  const base = normalizeServerUrl(serverUrl);

  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {}

  if (!res.ok) {
    throw new Error((body.error as string) ?? "Login failed");
  }

  const profileId = (body.profileId as string) ?? "";
  if (!profileId) throw new Error("Login succeeded but no profile ID returned");

  const cookie = extractMcSessionCookie(res.headers.get("set-cookie") ?? "");

  return { profileId, username: (body.username as string) ?? "", cookie };
}
