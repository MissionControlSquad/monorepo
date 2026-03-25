import { loginWithCredentials, normalizeServerUrl } from "@agentcenter/utils";
import { saveSession, clearSession } from "./session";

export async function login(
  serverUrl: string,
  username: string,
  password: string,
): Promise<{ profileId: string; username: string }> {
  const { profileId, username: user, cookie } = await loginWithCredentials(
    serverUrl,
    username,
    password,
  );

  // Always persist serverUrl + profileId. On iOS the native networking layer
  // (NSURLSession) stores the Set-Cookie internally and strips it from the
  // JS-visible headers, so `cookie` may be empty — that's OK because
  // `credentials: "include"` in the urql client lets the native cookie jar
  // attach it automatically to subsequent requests.
  await saveSession(normalizeServerUrl(serverUrl), cookie, profileId);

  return { profileId, username: user };
}

export async function logout(): Promise<void> {
  await clearSession();
}
