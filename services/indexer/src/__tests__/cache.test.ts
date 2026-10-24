/**
 * Unit tests for CacheService.
 *
 * All Redis interactions are faked with a minimal in-memory implementation
 * that satisfies the RedisCacheClient interface — no real Redis process is
 * needed. ioredis-mock is used where a more realistic fake is required (e.g.
 * for SCAN-based invalidation).
 */

import { CacheService, CacheKeys, NoopCacheService, RedisCacheClient } from "../cache";
import { logger } from "../logger";

// ── Minimal in-memory Redis fake ──────────────────────────────────────────────

class InMemoryCache implements RedisCacheClient {
  private store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(
    key: string,
    value: string,
    _exMode: "EX",
    ttlSeconds: number
  ): Promise<string | null> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
    }
    return count;
  }

  async scan(
    cursor: string,
    _matchArg: "MATCH",
    pattern: string,
    _countArg: "COUNT",
    _count: number
  ): Promise<[string, string[]]> {
    if (cursor !== "0") return ["0", []];
    const prefix = pattern.replace(/\*$/, "");
    const matched = [...this.store.keys()].filter((k) => k.startsWith(prefix));
    return ["0", matched];
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCache(): { service: CacheService; redis: InMemoryCache } {
  const redis = new InMemoryCache();
  const service = new CacheService(redis);
  return { service, redis };
}

// ── CacheService.get / set ────────────────────────────────────────────────────

describe("CacheService.get", () => {
  it("returns null on a cache miss", async () => {
    const { service } = makeCache();
    expect(await service.get("nonexistent")).toBeNull();
  });

  it("returns the stored value on a cache hit", async () => {
    const { service } = makeCache();
    await service.set("key", { hello: "world" }, 60);
    expect(await service.get("key")).toEqual({ hello: "world" });
  });

  it("parses stored JSON back to the original type", async () => {
    const { service } = makeCache();
    const original = { id: 1, name: "alice", tags: ["a", "b"] };
    await service.set("key", original, 60);
    expect(await service.get("key")).toEqual(original);
  });

  it("returns null when the underlying Redis call throws", async () => {
    const brokenRedis: RedisCacheClient = {
      get: async () => { throw new Error("Redis unavailable"); },
      set: async () => null,
      del: async () => 0,
      scan: async () => ["0", []],
    };
    const service = new CacheService(brokenRedis);
    // Should degrade gracefully without throwing
    expect(await service.get("key")).toBeNull();
  });

  it("logs HIT when the key exists", async () => {
    const debugSpy = jest.spyOn(logger, "debug");
    const { service } = makeCache();
    await service.set("logged-key", 42, 60);
    await service.get("logged-key");
    expect(debugSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cache: "HIT", key: "logged-key" }),
      "Cache HIT"
    );
    debugSpy.mockRestore();
  });

  it("logs MISS when the key is absent", async () => {
    const debugSpy = jest.spyOn(logger, "debug");
    const { service } = makeCache();
    await service.get("absent-key");
    expect(debugSpy).toHaveBeenCalledWith(
      expect.objectContaining({ cache: "MISS", key: "absent-key" }),
      "Cache MISS"
    );
    debugSpy.mockRestore();
  });
});

describe("CacheService.set", () => {
  it("stores the value with the given TTL", async () => {
    const { service, redis } = makeCache();
    await service.set("ttl-key", "value", 30);
    expect(await redis.get("ttl-key")).toBe(JSON.stringify("value"));
  });

  it("does not throw when the underlying Redis call fails", async () => {
    const brokenRedis: RedisCacheClient = {
      get: async () => null,
      set: async () => { throw new Error("Redis unavailable"); },
      del: async () => 0,
      scan: async () => ["0", []],
    };
    const service = new CacheService(brokenRedis);
    // Should not throw
    await expect(service.set("key", "value", 60)).resolves.toBeUndefined();
  });
});

describe("CacheService.del", () => {
  it("removes the specified keys", async () => {
    const { service, redis } = makeCache();
    await service.set("k1", 1, 60);
    await service.set("k2", 2, 60);
    await service.del("k1", "k2");
    expect(redis.size()).toBe(0);
  });

  it("is a no-op when given no keys", async () => {
    const { service, redis } = makeCache();
    await service.set("k", 1, 60);
    await service.del();
    expect(redis.size()).toBe(1);
  });
});

// ── CacheService.invalidate ───────────────────────────────────────────────────

describe("CacheService.invalidate", () => {
  it("deletes all keys matching a glob pattern", async () => {
    const { service, redis } = makeCache();
    await service.set("linkora:cache:profile:GAAA", { username: "alice" }, 60);
    await service.set("linkora:cache:profile:GBBB", { username: "bob" }, 60);
    await service.set("linkora:cache:feed:GAAA:0:20", [], 30);

    await service.invalidate("linkora:cache:profile:*");
    // Allow the async fire-and-forget invalidation to settle
    await new Promise((r) => setTimeout(r, 10));

    expect(await redis.get("linkora:cache:profile:GAAA")).toBeNull();
    expect(await redis.get("linkora:cache:profile:GBBB")).toBeNull();
    // Feed key should be untouched
    expect(await redis.get("linkora:cache:feed:GAAA:0:20")).not.toBeNull();
  });

  it("is a no-op when no keys match the pattern", async () => {
    const { service, redis } = makeCache();
    await service.set("linkora:cache:pool:1", {}, 120);
    await service.invalidate("linkora:cache:profile:*");
    await new Promise((r) => setTimeout(r, 10));
    expect(redis.size()).toBe(1);
  });

  it("does not throw when the underlying Redis scan fails", async () => {
    const brokenRedis: RedisCacheClient = {
      get: async () => null,
      set: async () => null,
      del: async () => 0,
      scan: async () => { throw new Error("SCAN failed"); },
    };
    const service = new CacheService(brokenRedis);
    await expect(service.invalidate("linkora:cache:*")).resolves.toBeUndefined();
  });
});

// ── CacheKeys ─────────────────────────────────────────────────────────────────

describe("CacheKeys", () => {
  const addr = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

  it("profile key includes the address", () => {
    expect(CacheKeys.profile(addr)).toContain(addr);
  });

  it("feed key includes viewerId, cursor, and limit", () => {
    expect(CacheKeys.feed(addr, "cursor123", 20)).toContain(addr);
    expect(CacheKeys.feed(addr, "cursor123", 20)).toContain("cursor123");
    expect(CacheKeys.feed(addr, "cursor123", 20)).toContain("20");
  });

  it("poolList key includes limit and cursor", () => {
    expect(CacheKeys.poolList("cur", 10)).toContain("10");
  });

  it("feedPattern with viewerId matches only that viewer", () => {
    const pattern = CacheKeys.feedPattern(addr);
    expect(pattern).toContain(addr);
    expect(pattern).toContain("*");
  });

  it("feedPattern without viewerId matches all feeds", () => {
    const pattern = CacheKeys.feedPattern();
    expect(pattern).not.toContain(addr);
    expect(pattern).toContain("*");
  });

  it("profileListPattern matches all profile list keys", () => {
    const pattern = CacheKeys.profileListPattern();
    expect(pattern).toContain("profiles:");
    expect(pattern).toContain("*");
  });

  it("poolListPattern matches all pool list keys", () => {
    const pattern = CacheKeys.poolListPattern();
    expect(pattern).toContain("pools:");
    expect(pattern).toContain("*");
  });
});

// ── NoopCacheService ──────────────────────────────────────────────────────────

describe("NoopCacheService", () => {
  it("always returns null on get", async () => {
    const noop = new NoopCacheService();
    await noop.set("key", "value", 60);
    expect(await noop.get("key")).toBeNull();
  });

  it("set/del/invalidate resolve without error", async () => {
    const noop = new NoopCacheService();
    await expect(noop.set("k", 1, 60)).resolves.toBeUndefined();
    await expect(noop.del("k")).resolves.toBeUndefined();
    await expect(noop.invalidate("linkora:cache:*")).resolves.toBeUndefined();
  });
});
