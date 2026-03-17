/**
 * Extract the real client IP from request headers.
 *
 * Priority:
 *   1. X-Real-IP — set by Traefik to the direct connecting IP (not spoofable)
 *   2. Rightmost X-Forwarded-For entry — the IP appended by the closest trusted proxy
 *   3. "unknown"
 *
 * We deliberately avoid the leftmost X-Forwarded-For entry because an attacker
 * can prepend arbitrary IPs to that header to bypass per-IP rate limits.
 */
export function getClientIp(headers: { get(name: string): string | null }): string {
  // Prefer X-Real-IP (single value, set by reverse proxy)
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  // Fall back to the rightmost entry in X-Forwarded-For
  // (the one appended by the closest trusted proxy, e.g. Traefik)
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",");
    return parts[parts.length - 1].trim();
  }

  return "unknown";
}
