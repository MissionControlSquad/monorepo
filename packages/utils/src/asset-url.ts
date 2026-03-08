/**
 * Central asset URL builder. All storage URLs flow through here.
 * @param storageKey - R2 storage key (e.g. "avatars/uuid-file.png") or existing URL
 * @param options.public - If true, appends ?public=1 to skip auth on the proxy route
 */
export function getAssetUrl(
  storageKey: string | null | undefined,
  options?: { public?: boolean },
): string | null {
  if (!storageKey) return null;
  // Already a full URL — pass through
  if (storageKey.startsWith("http://") || storageKey.startsWith("https://")) return storageKey;
  // Already a relative API path
  if (storageKey.startsWith("/api/storage/")) {
    return options?.public
      ? `${storageKey}${storageKey.includes("?") ? "&" : "?"}public=1`
      : storageKey;
  }
  // Raw storage key — build the proxy URL
  const base = `/api/storage/${storageKey}`;
  return options?.public ? `${base}?public=1` : base;
}
