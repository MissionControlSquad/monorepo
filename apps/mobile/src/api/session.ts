/**
 * Session management: cookie + profileId stored in SecureStore.
 * The module-level variables allow the URQL client to read synchronously.
 */
import * as SecureStore from "expo-secure-store";

const COOKIE_KEY = "mc_session";
const PROFILE_ID_KEY = "mc_profileId";

let _cookie: string | null = null;
let _profileId: string | null = null;

export function getStoredCookie(): string | null {
  return _cookie;
}

export function getStoredProfileId(): string | null {
  return _profileId;
}

export async function loadSession(): Promise<void> {
  _cookie = await SecureStore.getItemAsync(COOKIE_KEY);
  _profileId = await SecureStore.getItemAsync(PROFILE_ID_KEY);
}

export async function saveSession(cookie: string, profileId: string): Promise<void> {
  _cookie = cookie;
  _profileId = profileId;
  await SecureStore.setItemAsync(COOKIE_KEY, cookie);
  await SecureStore.setItemAsync(PROFILE_ID_KEY, profileId);
}

export async function clearSession(): Promise<void> {
  _cookie = null;
  _profileId = null;
  await SecureStore.deleteItemAsync(COOKIE_KEY);
  await SecureStore.deleteItemAsync(PROFILE_ID_KEY);
}
