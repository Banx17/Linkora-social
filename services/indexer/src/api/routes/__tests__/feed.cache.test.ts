/**
 * Unit tests for the feed router with Redis caching.
 *
 * Verifies that:
 *   - Feed responses are served from cache on HIT without hitting the DB/pool
 *   - Cache is populated on MISS
 *   - Tag-filtered requests bypass the cache (key-space explosion prevention)
 */

import express from "express";
import request from "supertest";
import { createFeedRouter } from "../feed";
import { Database, Post } from "../../../db";
import { CacheService } from "../../../cache";

const VALID_ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

function makePost(id: bigint = 1n): Post {
  return {
    id,
    author: VALID_ADDRESS,
    deleted: false,
    tip_total: 0n,
    like_count: 0n,
    created_ledger: 100,
    deleted_ledger: null,
  };
}

function makeCache(overrides: Partial<CacheService> = {}): jest.Mocked<CacheService> {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    invalidate: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as jest.Mocked<CacheService>;
}

function makeDb(posts: Post[] = []): Database {
  return {
    listPosts: jest.fn().mockResolvedValue({ posts, total: posts.length }),
    getBlockedUsers: jest.fn().mockResolvedValue({ blocked: [] }),
  } as unknown as Database;
}

function buildApp(db: Database, cache?: CacheService) {
  const app = express();
  app.use(express.json());
  app.use("/feed", createFeedRouter(db, cache));
  return app;
}

// ── GET /feed/following/:address ──────────────────────────────────────────────

describe("GET /feed/following/:address — with cache", () => {
  it("serves from cache on a HIT without querying the pool", async () => {
    const cachedBody = {
      posts: [{ id: "1", author: VALID_ADDRESS }],
      has_more: false,
      next_cursor: null,
    };
    const cache = makeCache({ get: jest.fn().mockResolvedValue(cachedBody) });
    const db = makeDb();
    const app = buildApp(db, cache);

    const res = await request(app).get(`/feed/following/${VALID_ADDRESS}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedBody);
    expect(db.listPosts).not.toHaveBeenCalled();
  });

  it("populates cache after a DB query on MISS", async () => {
    const posts = [makePost(1n)];
    const cache = makeCache();
    const db = makeDb(posts);
    const app = buildApp(db, cache);

    const res = await request(app).get(`/feed/following/${VALID_ADDRESS}?limit=10`);

    expect(res.status).toBe(200);
    // Cache.set must have been called with the response body
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining(VALID_ADDRESS),
      expect.any(Object),
      expect.any(Number)
    );
  });

  it("bypasses cache when a tag filter is present", async () => {
    const cache = makeCache();
    const db = makeDb([makePost(1n)]);
    const app = buildApp(db, cache);

    await request(app).get(`/feed/following/${VALID_ADDRESS}?tag=art`);

    // get is called to check but will return null; set must NOT be called for
    // tag-filtered responses (key-space explosion prevention)
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("does not cache when cache is not provided", async () => {
    const db = makeDb([makePost()]);
    const app = buildApp(db); // no cache

    const res = await request(app).get(`/feed/following/${VALID_ADDRESS}`);
    expect(res.status).toBe(200);
  });
});

// ── GET /feed (home feed) ─────────────────────────────────────────────────────

describe("GET /feed — with cache", () => {
  it("serves from cache on a HIT", async () => {
    const cachedBody = { posts: [], total: 0, limit: 20, offset: 0, has_more: false };
    const cache = makeCache({ get: jest.fn().mockResolvedValue(cachedBody) });
    const db = makeDb();
    const app = buildApp(db, cache);

    const res = await request(app).get("/feed");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(cachedBody);
    expect(db.listPosts).not.toHaveBeenCalled();
  });

  it("populates cache after querying DB on MISS", async () => {
    const cache = makeCache();
    const db = makeDb([makePost()]);
    const app = buildApp(db, cache);

    await request(app).get("/feed?limit=5");

    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining("feed:"),
      expect.any(Object),
      expect.any(Number)
    );
  });
});
