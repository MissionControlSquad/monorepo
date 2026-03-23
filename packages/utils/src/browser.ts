/**
 * Browser/Electron utility functions.
 * These are pure functions with no React dependency.
 */

/**
 * Converts a base64url-encoded string (RFC 4648) to a Uint8Array.
 * Required by the Web Push API when subscribing with a VAPID key.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Returns `true` if a KeyboardEvent should be ignored for global shortcuts.
 * Filters out events fired while the user is typing in an input, textarea,
 * contentEditable element, or when a modifier key is held.
 */
export function shouldIgnoreKeyboardShortcut(e: {
  target: EventTarget | null;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}): boolean {
  const target = e.target as HTMLElement | null;
  if (target) {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if ((target as HTMLElement).isContentEditable) return true;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return true;
  return false;
}
