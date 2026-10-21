import { Router, Request, Response } from "express";
import { Database } from "../../db";
import { validateParams, validateQuery } from "../../middleware/validate";
import { z } from "zod";
import { stellarAddressSchema, cursorPaginationSchema } from "@linkora/types/src/schemas";
import { encodeCursor, decodeCursor } from "./cursor";

const addressParamsSchema = z.object({
  address: stellarAddressSchema,
});

/**
 * Decodes a follows cursor (opaque base64 token) into the address value used
 * for keyset pagination.  The cursor encodes `"followerAddress|followerAddress"`
 * using the composite pattern from cursor.ts.  Returns `null` for anything
 * malformed so the caller can fall back to a first-page query.
 */
function decodeFollowsCursor(cursor: string): string | null {
  const decoded = decodeCursor(cursor);
  if (!decoded) return null;
  return decoded.id; // id half holds the address
}

export function createFollowsRouter(db: Database): Router {
  const router = Router();

  router.get(
    "/:address/followers",
    validateParams(addressParamsSchema),
    validateQuery(cursorPaginationSchema),
    async (req: Request, res: Response): Promise<void> => {
      const { address } = req.params;
      const { limit, cursor } = req.query as unknown as z.infer<typeof cursorPaginationSchema>;

      // Decode opaque cursor to an offset understood by the underlying DB
      // method.  Follows are relatively small lists so keyset-by-address is
      // handled via the existing offset path until a native keyset query is
      // added to PostgresDatabase.  The cursor encodes the offset as its value
      // half so the token is opaque to callers.
      let offset = 0;
      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (!decoded) {
          res.status(400).json({
            error: { code: "INVALID_CURSOR", message: "Invalid cursor token" },
          });
          return;
        }
        const parsedOffset = parseInt(decoded.value, 10);
        if (!Number.isFinite(parsedOffset) || parsedOffset < 0) {
          res.status(400).json({
            error: { code: "INVALID_CURSOR", message: "Invalid cursor token" },
          });
          return;
        }
        offset = parsedOffset;
      }

      const { followers, total } = await db.getFollowers(address, limit, offset);

      const nextOffset = offset + followers.length;
      const hasMore = nextOffset < total;
      const nextCursor = hasMore ? encodeCursor(String(nextOffset), String(nextOffset)) : null;

      res.json({
        address,
        followers,
        total,
        limit,
        cursor: cursor ?? null,
        next_cursor: nextCursor,
        has_more: hasMore,
      });
    }
  );

  router.get(
    "/:address/following",
    validateParams(addressParamsSchema),
    validateQuery(cursorPaginationSchema),
    async (req: Request, res: Response): Promise<void> => {
      const { address } = req.params;
      const { limit, cursor } = req.query as unknown as z.infer<typeof cursorPaginationSchema>;

      let offset = 0;
      if (cursor) {
        const decoded = decodeCursor(cursor);
        if (!decoded) {
          res.status(400).json({
            error: { code: "INVALID_CURSOR", message: "Invalid cursor token" },
          });
          return;
        }
        const parsedOffset = parseInt(decoded.value, 10);
        if (!Number.isFinite(parsedOffset) || parsedOffset < 0) {
          res.status(400).json({
            error: { code: "INVALID_CURSOR", message: "Invalid cursor token" },
          });
          return;
        }
        offset = parsedOffset;
      }

      const { following, total } = await db.getFollowing(address, limit, offset);

      const nextOffset = offset + following.length;
      const hasMore = nextOffset < total;
      const nextCursor = hasMore ? encodeCursor(String(nextOffset), String(nextOffset)) : null;

      res.json({
        address,
        following,
        total,
        limit,
        cursor: cursor ?? null,
        next_cursor: nextCursor,
        has_more: hasMore,
      });
    }
  );

  return router;
}
