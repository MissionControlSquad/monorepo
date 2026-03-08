import { NextResponse } from "next/server";

/**
 * Cache-Control presets for API responses.
 *
 * - `immutable`: Static data that never changes (templates, static config)
 * - `short`: Data that changes infrequently (agent list, project list)
 * - `none`: Real-time data that must always be fresh (tasks, messages)
 */
export const CachePreset = {
  /** 24 hours, public — for truly static data */
  immutable: "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600",
  /** 5 minutes, private — for semi-static authenticated data */
  short: "private, max-age=300, stale-while-revalidate=60",
  /** No caching — for real-time data */
  none: "private, no-cache, no-store, must-revalidate",
} as const;

/**
 * Create a JSON response with Cache-Control header.
 */
export function cachedJsonResponse(data: unknown, cacheControl: string, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": cacheControl },
  });
}
