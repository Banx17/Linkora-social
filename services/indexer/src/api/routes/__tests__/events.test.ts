import express from "express";
import request from "supertest";
import { createEventsRouter } from "../events";
import { Database, ChainEvent } from "../../../db";
import { encodeCursor } from "../cursor";

function makeEvent(overrides: Partial<ChainEvent> = {}): ChainEvent {
  return {
    id: 1n,
    ledger_sequence: 5000,
    event_index: 0,
    contract_id: "CCONTRACT123456789",
    topic: ["transfer"],
    data: { amount: "100" },
    processed_at: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeDb(overrides: Partial<Database> = {}): Database {
  return {
    listEventsCursor: jest.fn().mockResolvedValue({ events: [], nextCursor: null }),
    ...overrides,
  } as unknown as Database;
}

function buildApp(db: Database) {
  const app = express();
  app.use(express.json());
  app.use("/events", createEventsRouter(db));
  return app;
}

function body(res: { body: unknown }): Record<string, unknown> {
  return res.body as Record<string, unknown>;
}

describe("GET /events — cursor pagination", () => {
  it("returns cursor pagination fields with no cursor", async () => {
    const events = [makeEvent({ id: 2n }), makeEvent({ id: 1n })];
    const db = makeDb({
      listEventsCursor: jest.fn().mockResolvedValue({ events, nextCursor: null }),
    });
    const app = buildApp(db);

    const res = await request(app).get("/events");
    expect(res.status).toBe(200);
    expect(body(res)).toHaveProperty("events");
    expect(body(res)).toHaveProperty("next_cursor", null);
    expect(body(res)).toHaveProperty("has_more", false);
    expect(body(res)).toHaveProperty("cursor", null);
    expect(body(res)).toHaveProperty("limit", 20);
  });

  it("serialises bigint id as a string", async () => {
    const db = makeDb({
      listEventsCursor: jest.fn().mockResolvedValue({
        events: [makeEvent({ id: 9999999999999n })],
        nextCursor: null,
      }),
    });
    const app = buildApp(db);

    const res = await request(app).get("/events");
    const events = body(res).events as Array<Record<string, unknown>>;
    expect(typeof events[0].id).toBe("string");
    expect(events[0].id).toBe("9999999999999");
  });

  it("forwards limit and cursor to the database", async () => {
    const cursor = encodeCursor("5000", "3");
    const listEventsCursor = jest.fn().mockResolvedValue({ events: [], nextCursor: null });
    const db = makeDb({ listEventsCursor });
    const app = buildApp(db);

    const res = await request(app).get(`/events?limit=5&cursor=${encodeURIComponent(cursor)}`);
    expect(res.status).toBe(200);
    expect(listEventsCursor).toHaveBeenCalledWith({
      limit: 5,
      cursor,
      contract_id: undefined,
      topic: undefined,
    });
  });

  it("forwards contract_id filter to the database", async () => {
    const listEventsCursor = jest.fn().mockResolvedValue({ events: [], nextCursor: null });
    const db = makeDb({ listEventsCursor });
    const app = buildApp(db);

    await request(app).get("/events?contract_id=CCONTRACT123");
    expect(listEventsCursor).toHaveBeenCalledWith(
      expect.objectContaining({ contract_id: "CCONTRACT123" })
    );
  });

  it("forwards topic filter to the database", async () => {
    const listEventsCursor = jest.fn().mockResolvedValue({ events: [], nextCursor: null });
    const db = makeDb({ listEventsCursor });
    const app = buildApp(db);

    await request(app).get("/events?topic=transfer");
    expect(listEventsCursor).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "transfer" })
    );
  });

  it("returns next_cursor and has_more=true when more pages exist", async () => {
    const nextCursor = encodeCursor("4999", "2");
    const db = makeDb({
      listEventsCursor: jest.fn().mockResolvedValue({
        events: [makeEvent()],
        nextCursor,
      }),
    });
    const app = buildApp(db);

    const res = await request(app).get("/events?limit=1");
    expect(res.status).toBe(200);
    expect(body(res).next_cursor).toBe(nextCursor);
    expect(body(res).has_more).toBe(true);
  });

  it("returns has_more=false and next_cursor=null on the last page", async () => {
    const db = makeDb({
      listEventsCursor: jest.fn().mockResolvedValue({ events: [makeEvent()], nextCursor: null }),
    });
    const app = buildApp(db);

    const res = await request(app).get("/events");
    expect(res.status).toBe(200);
    expect(body(res).next_cursor).toBeNull();
    expect(body(res).has_more).toBe(false);
  });

  it("echoes the cursor param back in the response envelope", async () => {
    const cursor = encodeCursor("4000", "7");
    const db = makeDb();
    const app = buildApp(db);

    const res = await request(app).get(`/events?cursor=${encodeURIComponent(cursor)}`);
    expect(res.status).toBe(200);
    expect(body(res).cursor).toBe(cursor);
  });

  it("rejects limit > 100 with 400", async () => {
    const app = buildApp(makeDb());
    const res = await request(app).get("/events?limit=200");
    expect(res.status).toBe(400);
  });

  it("rejects a non-base64 cursor with 400", async () => {
    const app = buildApp(makeDb());
    const res = await request(app).get("/events?cursor=not+valid!!!");
    expect(res.status).toBe(400);
  });

  it("no duplicate or skipped rows — composite (ledger_sequence, event_index) cursor", async () => {
    // Two events share ledger_sequence=5000; cursor after (5000, event_index=1)
    // must yield event_index=0 on the next page, never re-yield event_index=1.
    const cursor = encodeCursor("5000", "1");
    const listEventsCursor = jest.fn().mockResolvedValue({ events: [], nextCursor: null });
    const db = makeDb({ listEventsCursor });
    const app = buildApp(db);

    await request(app).get(`/events?limit=1&cursor=${encodeURIComponent(cursor)}`);
    expect(listEventsCursor).toHaveBeenCalledWith({
      limit: 1,
      cursor,
      contract_id: undefined,
      topic: undefined,
    });
  });
});
