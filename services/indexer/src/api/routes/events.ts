import { Router, Request, Response } from "express";
import { Database } from "../../db";
import { validateQuery } from "../../middleware/validate";
import { z } from "zod";
import { cursorPaginationSchema } from "@linkora/types/src/schemas";
import { internalError } from "@linkora/types/src/errors";

const listEventsQuerySchema = cursorPaginationSchema.extend({
  contract_id: z.string().min(1).optional(),
  topic: z.string().min(1).optional(),
});

export function createEventsRouter(db: Database): Router {
  const router = Router();

  /**
   * GET /api/events
   *
   * Returns a cursor-paginated list of raw on-chain events from `raw_events`,
   * sorted newest-first by (ledger_sequence DESC, event_index DESC).
   *
   * Query params:
   *   limit       — 1–100, default 20
   *   cursor      — opaque base64 token from a previous response's `next_cursor`
   *   contract_id — filter to a single contract address
   *   topic       — filter by first topic value (exact match)
   *
   * The composite keyset cursor `(ledger_sequence, event_index)` guarantees no
   * skipped or duplicated rows when new events are ingested between requests.
   */
  router.get(
    "/",
    validateQuery(listEventsQuerySchema),
    async (req: Request, res: Response): Promise<void> => {
      const { limit, cursor, contract_id, topic } = req.query as unknown as z.infer<
        typeof listEventsQuerySchema
      >;

      try {
        const { events, nextCursor } = await db.listEventsCursor({
          limit,
          cursor: cursor || undefined,
          contract_id: contract_id || undefined,
          topic: topic || undefined,
        });

        res.json({
          events: events.map((e) => ({
            ...e,
            id: e.id.toString(),
          })),
          limit,
          cursor: cursor ?? null,
          next_cursor: nextCursor,
          has_more: nextCursor !== null,
        });
      } catch {
        const err = internalError("Failed to fetch events");
        res.status(err.statusCode).json(err.toJSON(req.context?.requestId));
      }
    }
  );

  return router;
}
