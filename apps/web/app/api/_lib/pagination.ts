export interface PaginationParams {
  limit: number;
  offset: number;
}

/**
 * Parse and clamp pagination query params from a URLSearchParams instance.
 *
 * - `limit`  is clamped to [1, maxLimit]   (default: defaultLimit)
 * - `offset` is clamped to [0, ∞)          (default: 0)
 */
export function parsePaginationParams(
  searchParams: URLSearchParams,
  config: { defaultLimit: number; maxLimit: number },
): PaginationParams {
  const { defaultLimit, maxLimit } = config;
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? String(defaultLimit), 10) || defaultLimit, 1),
    maxLimit,
  );
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
  return { limit, offset };
}
