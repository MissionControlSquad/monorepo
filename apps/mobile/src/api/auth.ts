import { saveSession, clearSession } from "./session";

export async function login(
  serverUrl: string,
  username: string,
  password: string,
): Promise<{ profileId: string; username: string }> {
  // Normalize: strip trailing slash
  const base = serverUrl.replace(/\/+$/, "");

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

  // Extract mc_session from Set-Cookie response header
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/mc_session=([^;]+)/);
  const cookie = match?.[1] ?? "";

  const profileId = (body.profileId as string) ?? "";
  const user = (body.username as string) ?? "";

  if (!profileId) {
    throw new Error("Login succeeded but no profile ID returned");
  }

  // Always persist serverUrl + profileId. On iOS the native networking layer
  // (NSURLSession) stores the Set-Cookie internally and strips it from the
  // JS-visible headers, so `cookie` may be empty — that's OK because
  // `credentials: "include"` in the urql client lets the native cookie jar
  // attach it automatically to subsequent requests.
  await saveSession(base, cookie, profileId);

  return { profileId, username: user };
}

export async function logout(): Promise<void> {
  await clearSession();
}
