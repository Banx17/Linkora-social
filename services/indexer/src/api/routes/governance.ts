import { Router, Request, Response } from "express";
import { Database } from "../../db";
import { validateQuery } from "../../middleware/validate";
import { cursorPaginationSchema } from "@linkora/types/src/schemas";
import { internalError } from "@linkora/types/src/errors";
import { z } from "zod";

export function createGovernanceRouter(db: Database): Router {
  const router = Router();

  router.get(
    "/proposals",
    validateQuery(cursorPaginationSchema),
    async (req: Request, res: Response): Promise<void> => {
      const { limit, cursor } = req.query as unknown as z.infer<typeof cursorPaginationSchema>;

      try {
        const { proposals, nextCursor } = await db.listGovernanceProposalsCursor({
          limit,
          cursor: cursor || undefined,
        });

        const serializedProposals = proposals.map((p) => ({
          ...p,
          proposal_id: p.proposal_id.toString(),
          new_value: p.new_value.toString(),
          votes_for: p.votes_for.toString(),
          votes_against: p.votes_against.toString(),
        }));

        res.json({
          proposals: serializedProposals,
          limit,
          cursor: cursor ?? null,
          next_cursor: nextCursor,
          has_more: nextCursor !== null,
        });
      } catch (error) {
        const err = internalError("Failed to list proposals");
        res.status(err.statusCode).json(err.toJSON(req.context?.requestId));
      }
    }
  );

  return router;
}
