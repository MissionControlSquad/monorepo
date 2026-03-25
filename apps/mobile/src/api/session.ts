/**
 * Session management: serverUrl + cookie + profileId stored in SecureStore.
 * The module-level variables allow the URQL client to read synchronously.
 *
 * `sessionReady` is a promise that resolves once `loadSession()` completes.
 * Components that need the session should await this before making requests,
 * preventing a race condition where fetch calls fire before SecureStore hydrates.
 */
import * as SecureStore from "expo-secure-store";

const SERVER_URL_KEY = "mc_server_url";
const COOKIE_KEY = "mc_session";
const PROFILE_ID_KEY = "mc_profileId";

let _serverUrl: string | null = null;
let _cookie: string | null = null;
let _profileId: string | null = null;
let _sessionLoaded = false;

let _resolveReady!: () => void;
export const sessionReady: Promise<void> = new Promise((resolve) => {
  _resolveReady = resolve;
});

export function isSessionLoaded(): boolean {
  return _sessionLoaded;
}

export function getStoredServerUrl(): string | null {
  return _serverUrl;
}

export function getStoredCookie(): string | null {
  return _cookie;
}

export function getStoredProfileId(): string | null {
  return _profileId;
}

export async function loadSession(): Promise<void> {
  _serverUrl = await SecureStore.getItemAsync(SERVER_URL_KEY);
  _cookie = await SecureStore.getItemAsync(COOKIE_KEY);
  _profileId = await SecureStore.getItemAsync(PROFILE_ID_KEY);
  _sessionLoaded = true;
  _resolveReady();
}

export async function saveSession(
  serverUrl: string,
  cookie: string,
  profileId: string,
): Promise<void> {
  _serverUrl = serverUrl;
  _cookie = cookie;
  _profileId = profileId;
  await SecureStore.setItemAsync(SERVER_URL_KEY, serverUrl);
  await SecureStore.setItemAsync(COOKIE_KEY, cookie);
  await SecureStore.setItemAsync(PROFILE_ID_KEY, profileId);
}

export async function clearSession(): Promise<void> {
  _serverUrl = null;
  _cookie = null;
  _profileId = null;
  await SecureStore.deleteItemAsync(SERVER_URL_KEY);
  await SecureStore.deleteItemAsync(COOKIE_KEY);
  await SecureStore.deleteItemAsync(PROFILE_ID_KEY);
}
