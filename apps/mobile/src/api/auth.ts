import { API_URL } from "../config";
import { saveSession, clearSession } from "./session";

export async function login(
  username: string,
  password: string,
): Promise<{ profileId: string; username: string }> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
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

  if (cookie && profileId) {
    await saveSession(cookie, profileId);
  }

  return { profileId, username: user };
}

export async function logout(): Promise<void> {
  await clearSession();
}
