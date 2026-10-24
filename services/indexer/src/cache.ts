/**
 * CacheService — Redis-backed cache layer for the Linkora indexer.
 *
 * Wraps ioredis with typed get/set/del methods and structured HIT/MISS logging.
 * Every cache key is prefixed with `linkora:cache:` so keys are easy to scan
 * and flush without touching rate-limit keys (prefixed `rl:indexer:`).
 *
 * TTL constants (in seconds):
 *   PROFILE_TTL  — 60 s  (single profile lookup)
 *   FEED_TTL     — 30 s  (home / following feed page)
 *   POOL_LIST_TTL — 120 s (paginated pool list)
 *
 * Invalidation:
 *   The `invalidate(pattern)` method issues an async SCAN + DEL. It is
 *   fire-and-forget from the caller's perspective: a failure to invalidate
 *   means the stale entry expires after its TTL, which is acceptable for
 *   eventually-consistent social data. Errors are logged at WARN level so
 *   they surface in monitoring without breaking writes.
 *
 * Graceful degradation:
 *   Every public method wraps its Redis call in a try/catch. A Redis
 *   outage degrades to cache-miss behaviour (the underlying DB is queried
 *   directly) without breaking the request path.
 */

import { logger } from "./logger";

// ── TTL constants ─────────────────────────────────────────────────────────────

export const PROFILE_TTL_S = 60;
export const FEED_TTL_S = 30;
export const POOL_LIST_TTL_S = 120;

// ── Key builders ──────────────────────────────────────────────────────────────

const PREFIX = "linkora:cache:";

export const CacheKeys = {
  profile: (address: string) => `${PREFIX}profile:${address}`,
  profileList: (cursor: string, limit: number) =>
    `${PREFIX}profiles:${limit}:${cursor ?? ""}`,
  feed: (viewerId: string, cursor: string, limit: number) =>
    `${PREFIX}feed:${viewerId ?? "anon"}:${limit}:${cursor ?? ""}`,
  poolList: (cursor: string, limit: number) =>
    `${PREFIX}pools:${limit}:${cursor ?? ""}`,

  // Glob patterns for bulk invalidation
  profilePattern: (address: string) => `${PREFIX}profile:${address}`,
  profileListPattern: () => `${PREFIX}profiles:*`,
  feedPattern: (viewerId?: string) =>
    viewerId ? `${PREFIX}feed:${viewerId}:*` : `${PREFIX}feed:*`,
  poolListPattern: () => `${PREFIX}pools:*`,
} as const;

// ── Redis client interface ────────────────────────────────────────────────────

/**
 * Minimal interface covering the ioredis methods used by CacheService.
 * Using an interface rather than importing the ioredis class directly means
 * tests can inject a lightweight fake without pulling in ioredis at all.
 */
export interface RedisCacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, exMode: "EX", ttlSeconds: number): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  scan(
    cursor: string,
    matchArg: "MATCH",
    pattern: string,
    countArg: "COUNT",
    count: number
  ): Promise<[string, string[]]>;
}

// ── CacheService ──────────────────────────────────────────────────────────────

export class CacheService {
  constructor(private readonly redis: RedisCacheClient) {}

  /**
   * Retrieve a cached value and parse it as JSON.
   * Returns `null` on a cache miss or any Redis error.
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (raw === null) {
        logger.debug({ cache: "MISS", key }, "Cache MISS");
        return null;
      }
      logger.debug({ cache: "HIT", key }, "Cache HIT");
      return JSON.parse(raw) as T;
    } catch (err) {
      logger.warn({ err, key }, "Cache GET error — treating as MISS");
      return null;
    }
  }

  /**
   * Serialise `value` as JSON and store it with the given TTL in seconds.
   * Fire-and-forget: errors are logged but do not propagate.
   */
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (err) {
      logger.warn({ err, key }, "Cache SET error — value not cached");
    }
  }

  /**
   * Delete one or more exact keys.
   * Fire-and-forget.
   */
  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (err) {
      logger.warn({ err, keys }, "Cache DEL error");
    }
  }

  /**
   * Scan and delete all keys matching a glob `pattern`.
   *
   * Uses `SCAN … MATCH … COUNT 100` to avoid blocking the Redis event loop.
   * Runs to completion in the background; errors are logged and do not throw.
   */
  async invalidate(pattern: string): Promise<void> {
    this.invalidateAsync(pattern).catch((err) => {
      logger.warn({ err, pattern }, "Cache invalidation error");
    });
  }

  private async invalidateAsync(pattern: string): Promise<void> {
    let cursor = "0";
    let totalDeleted = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== "0");

    if (totalDeleted > 0) {
      logger.debug({ pattern, totalDeleted }, "Cache invalidated");
    }
  }
}

// ── No-op implementation for when Redis is not configured ─────────────────────

/**
 * A CacheService that never stores or returns anything. Used when
 * `REDIS_CACHE_URL` is not set so the API still starts without Redis.
 */
export class NoopCacheService extends CacheService {
  constructor() {
    // Stub client that satisfies the interface but does nothing
    super({
      get: async () => null,
      set: async () => null,
      del: async () => 0,
      scan: async () => ["0", []],
    });
  }
}
