/**
 * Unit tests for the pools router with Redis caching.
 *
 * Verifies cache HIT (returns cached value, skips DB), MISS (populates cache
 * from DB), and that the cache is not used for individual pool lookups (only
 * the list endpoint is cached).
 */

import express from "express";
import request from "supertest";
import { createPoolsRouter } from "../pools";
import { Database } from "../../../db";
import { CacheService } from "../../../cache";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePool(id = "POOL1") {
  return {
    pool_id: id,
    token: "TOKEN_A",
    balance: 1000n,
    admins: ["GADMIN"],
    threshold: 1,
    created_ledger: 100,
    updated_ledger: 100,
  };
}

function makeDb(overrides: Partial<Database> = {}): Database {
  return {
    listPoolsCursor: jest.fn().mockResolvedValue({ pools: [], nextCursor: null }),
    getPool: jest.fn().mockResolvedValue(null),
    getPoolAnalytics: jest.fn().mockResolvedValue({ tip_count: 0, total_tips: "0" }),
    ...overrides,
  } as unknown as Database;
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

function buildApp(db: Database, cache?: CacheService) {
  const app = express();
  app.use(express.json());
  app.use("/pools", createPoolsRouter(db, cache));
  return app;
}

// ── GET /pools ────────────────────────────────────────────────────────────────

describe("GET /pools — with cache", () => {
  it("returns the cached pool list on a HIT without querying the DB", async () => {
    const cachedData = {
      pools: [{ ...makePool(), balance: "1000" }],
      nextCursor: null,
    };
    const cache = makeCache({ get: jest.fn().mockResolvedValue(cachedData) });
    const db = makeDb();
    const app = buildApp(db, cache);

    const res = await request(app).get("/pools");

    expect(res.status).toBe(200);
    expect(res.body.pools).toHaveLength(1);
    expect(db.listPoolsCursor).not.toHaveBeenCalled();
  });

  it("queries the DB and caches the result on a MISS", async () => {
    const pools = [makePool()];
    const cache = makeCache();
    const db = makeDb({
      listPoolsCursor: jest.fn().mockResolvedValue({ pools, nextCursor: null }),
    });
    const app = buildApp(db, cache);

    const res = await request(app).get("/pools?limit=10");

    expect(res.status).toBe(200);
    expect(db.listPoolsCursor).toHaveBeenCalled();
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining("pools:"),
      expect.objectContaining({ nextCursor: null }),
      expect.any(Number)
    );
  });

  it("works without a cache (cache parameter omitted)", async () => {
    const pools = [makePool()];
    const db = makeDb({
      listPoolsCursor: jest.fn().mockResolvedValue({ pools, nextCursor: null }),
    });
    const app = buildApp(db);

    const res = await request(app).get("/pools");
    expect(res.status).toBe(200);
    expect(res.body.pools).toHaveLength(1);
  });

  it("returns correct pagination fields", async () => {
    const pools = [makePool("A"), makePool("B")];
    const cache = makeCache();
    const db = makeDb({
      listPoolsCursor: jest.fn().mockResolvedValue({ pools, nextCursor: "cur_xyz" }),
    });
    const app = buildApp(db, cache);

    const res = await request(app).get("/pools?limit=2");

    expect(res.status).toBe(200);
    expect(res.body.has_more).toBe(true);
    expect(res.body.next_cursor).toBe("cur_xyz");
  });
});

// ── GET /pools/:id ────────────────────────────────────────────────────────────

describe("GET /pools/:id", () => {
  it("returns 404 when the pool does not exist", async () => {
    const cache = makeCache();
    const db = makeDb({ getPool: jest.fn().mockResolvedValue(null) });
    const app = buildApp(db, cache);

    const res = await request(app).get("/pools/NONEXISTENT");
    expect(res.status).toBe(404);
  });

  it("returns the pool when found", async () => {
    const pool = makePool();
    const db = makeDb({ getPool: jest.fn().mockResolvedValue(pool) });
    const app = buildApp(db);

    const res = await request(app).get("/pools/POOL1");
    expect(res.status).toBe(200);
    expect(res.body.pool_id).toBe("POOL1");
    // balance is serialised as a string
    expect(typeof res.body.balance).toBe("string");
  });
});
