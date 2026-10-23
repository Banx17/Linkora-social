/**
 * Unit tests for the profiles router with Redis caching.
 *
 * The cache is injected as a mock CacheService so no real Redis process is
 * needed. Tests verify HIT (returns cached value, skips DB), MISS (populates
 * cache from DB), and that the cache is used correctly for both list and
 * single-profile routes.
 */

import express from "express";
import request from "supertest";
import { createProfilesRouter } from "../profiles";
import { Database, Profile } from "../../../db";
import { CacheService } from "../../../cache";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    address: VALID_ADDRESS,
    username: "alice",
    creator_token: "",
    updated_ledger: 100,
    ...overrides,
  };
}

function makeDb(overrides: Partial<Database> = {}): Database {
  return {
    listProfilesCursor: jest.fn().mockResolvedValue({ profiles: [], nextCursor: null }),
    getProfile: jest.fn().mockResolvedValue(null),
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
  app.use("/profiles", createProfilesRouter(db, cache));
  return app;
}

// ── GET /profiles/:address ────────────────────────────────────────────────────

describe("GET /profiles/:address — with cache", () => {
  it("returns the cached profile on a HIT without querying the DB", async () => {
    const profile = makeProfile({ username: "cached-user" });
    const cache = makeCache({ get: jest.fn().mockResolvedValue(profile) });
    const db = makeDb();
    const app = buildApp(db, cache);

    const res = await request(app).get(`/profiles/${VALID_ADDRESS}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("cached-user");
    expect(db.getProfile).not.toHaveBeenCalled();
  });

  it("queries the DB and populates the cache on a MISS", async () => {
    const profile = makeProfile({ username: "db-user" });
    const cache = makeCache();
    const db = makeDb({ getProfile: jest.fn().mockResolvedValue(profile) });
    const app = buildApp(db, cache);

    const res = await request(app).get(`/profiles/${VALID_ADDRESS}`);

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("db-user");
    expect(db.getProfile).toHaveBeenCalledWith(VALID_ADDRESS);
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining(VALID_ADDRESS),
      profile,
      expect.any(Number)
    );
  });

  it("returns 404 when the profile does not exist", async () => {
    const cache = makeCache();
    const db = makeDb({ getProfile: jest.fn().mockResolvedValue(null) });
    const app = buildApp(db, cache);

    const res = await request(app).get(`/profiles/${VALID_ADDRESS}`);

    expect(res.status).toBe(404);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it("works without a cache (cache parameter omitted)", async () => {
    const profile = makeProfile();
    const db = makeDb({ getProfile: jest.fn().mockResolvedValue(profile) });
    const app = buildApp(db);

    const res = await request(app).get(`/profiles/${VALID_ADDRESS}`);
    expect(res.status).toBe(200);
  });
});

// ── GET /profiles ─────────────────────────────────────────────────────────────

describe("GET /profiles — with cache", () => {
  it("returns the cached list on a HIT without querying the DB", async () => {
    const cachedData = {
      profiles: [makeProfile()],
      nextCursor: null,
    };
    const cache = makeCache({ get: jest.fn().mockResolvedValue(cachedData) });
    const db = makeDb();
    const app = buildApp(db, cache);

    const res = await request(app).get("/profiles");

    expect(res.status).toBe(200);
    expect(res.body.profiles).toHaveLength(1);
    expect(db.listProfilesCursor).not.toHaveBeenCalled();
  });

  it("queries the DB and caches the result on a MISS", async () => {
    const profiles = [makeProfile()];
    const cache = makeCache();
    const db = makeDb({
      listProfilesCursor: jest.fn().mockResolvedValue({ profiles, nextCursor: null }),
    });
    const app = buildApp(db, cache);

    const res = await request(app).get("/profiles?limit=10");

    expect(res.status).toBe(200);
    expect(res.body.profiles).toHaveLength(1);
    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining("profiles:"),
      expect.objectContaining({ profiles, nextCursor: null }),
      expect.any(Number)
    );
  });
});
