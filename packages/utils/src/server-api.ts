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
