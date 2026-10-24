import { Router, Request, Response } from "express";
import { Database } from "../../db";
import { validateParams, validateQuery } from "../../middleware/validate";
import { z } from "zod";
import { stellarAddressSchema, cursorPaginationSchema } from "@linkora/types/src/schemas";
import { notFoundError } from "@linkora/types/src/errors";
import { CacheService, CacheKeys, PROFILE_TTL_S } from "../../cache";

const getProfileParamsSchema = z.object({
  address: stellarAddressSchema,
});

export function createProfilesRouter(db: Database, cache?: CacheService): Router {
  const router = Router();

  router.get(
    "/",
    validateQuery(cursorPaginationSchema),
    async (req: Request, res: Response): Promise<void> => {
      const { limit, cursor } = req.query as unknown as z.infer<typeof cursorPaginationSchema>;

      const cacheKey = CacheKeys.profileList(cursor ?? "", limit);
      if (cache) {
        const cached = await cache.get<{ profiles: unknown[]; nextCursor: string | null }>(
          cacheKey
        );
        if (cached) {
          res.json({
            profiles: cached.profiles,
            limit,
            cursor: cursor ?? null,
            next_cursor: cached.nextCursor,
            has_more: cached.nextCursor !== null,
          });
          return;
        }
      }

      const { profiles, nextCursor } = await db.listProfilesCursor({
        limit,
        cursor: cursor || undefined,
      });

      if (cache) {
        await cache.set(cacheKey, { profiles, nextCursor }, PROFILE_TTL_S);
      }

      res.json({
        profiles,
        limit,
        cursor: cursor ?? null,
        next_cursor: nextCursor,
        has_more: nextCursor !== null,
      });
    }
  );

  router.get(
    "/:address",
    validateParams(getProfileParamsSchema),
    async (req: Request, res: Response): Promise<void> => {
      const { address } = req.params;

      if (cache) {
        const cacheKey = CacheKeys.profile(address);
        const cached = await cache.get(cacheKey);
        if (cached) {
          res.json(cached);
          return;
        }
      }

      const profile = await db.getProfile(address);
      if (!profile) {
        const err = notFoundError("Profile not found");
        res.status(err.statusCode).json(err.toJSON(req.context?.requestId));
        return;
      }

      if (cache) {
        await cache.set(CacheKeys.profile(address), profile, PROFILE_TTL_S);
      }

      res.json(profile);
    }
  );

  return router;
}
