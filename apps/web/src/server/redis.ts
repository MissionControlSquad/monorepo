/**
 * Shared Redis client singleton.
 *
 * Returns a connected ioredis client when REDIS_URL is set,
 * or null for local dev (features fall back to in-memory).
 */

let _client: import("ioredis").default | null = null;
let _initialized = false;

export function getRedisClient(): import("ioredis").default | null {
  if (_initialized) return _client;
  _initialized = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    // Dynamic require to avoid bundling ioredis in edge runtime
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: Redis } = require("ioredis");
    _client = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableOfflineQueue: true,
    });

    _client!.on("error", (err: Error) => {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          tag: "redis",
          message: `Redis client error: ${err.message}`,
        }),
      );
    });

    _client!.connect().catch(() => {
      // Connection will be retried automatically by ioredis
    });
  } catch {
    _client = null;
  }

  return _client;
}
