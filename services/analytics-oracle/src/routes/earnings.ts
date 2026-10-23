/**
 * Creator Earnings Dashboard API endpoint (Issue #1756).
 *
 * GET /analytics/creators/:accountId/earnings
 *
 * Returns aggregate earnings for a creator broken down by:
 *   - totalTips        — tips received (7d / 30d / all-time)
 *   - poolFees         — fees earned from pools the creator deployed
 *   - governanceRewards — staking rewards from governance participation
 *   - topTippers       — top 5 tippers by total amount
 *   - earningsByDay    — daily tip breakdown for the last 30 days
 *
 * Data is sourced from indexed contract events stored in the shared
 * indexer PostgreSQL database.
 */

import { Router, Request, Response } from "express";
import { Pool } from "pg";
import { z } from "zod";
import { logger } from "../logger.js";
import { notFoundError, internalError, isAppError } from "@linkora/types/src/errors.js";
import { validateParams } from "../middleware/validate.js";

// ── Param schema ──────────────────────────────────────────────────────────────

const accountParamsSchema = z.object({
  accountId: z.string().regex(/^G[A-Z2-7]{55}$/, "Invalid Stellar address format"),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PeriodBreakdown {
  sevenDay: string;
  thirtyDay: string;
  allTime: string;
}

export interface TopTipper {
  address: string;
  totalAmount: string;
  tipCount: number;
}

export interface DailyEarning {
  /** ISO date string YYYY-MM-DD */
  date: string;
  amount: string;
}

export interface EarningsDashboard {
  accountId: string;
  totalTips: PeriodBreakdown;
  poolFees: PeriodBreakdown;
  governanceRewards: PeriodBreakdown;
  topTippers: TopTipper[];
  /** Daily tip totals for the last 30 days, suitable for charting. */
  earningsByDay: DailyEarning[];
  computedAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ── Queries ───────────────────────────────────────────────────────────────────

async function queryTipsSince(db: Pool, creatorAddress: string, since: Date): Promise<string> {
  const result = await db.query<{ total: string }>(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
     FROM tips t
     JOIN posts p ON p.id = t.post_id
     WHERE p.author = $1
       AND p.deleted_at IS NULL
       AND t.created_at >= $2`,
    [creatorAddress, since]
  );
  return (result.rows[0]?.total ?? "0").toString();
}

async function queryPoolFeesSince(db: Pool, creatorAddress: string, since: Date): Promise<string> {
  try {
    const result = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(fee_amount), 0) AS total
       FROM pool_fee_events
       WHERE creator_address = $1
         AND created_at >= $2`,
      [creatorAddress, since]
    );
    return (result.rows[0]?.total ?? "0").toString();
  } catch (err: unknown) {
    // Table may not exist yet — return 0 gracefully.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist") || msg.includes("relation")) return "0";
    throw err;
  }
}

async function queryGovernanceRewardsSince(
  db: Pool,
  creatorAddress: string,
  since: Date
): Promise<string> {
  try {
    const result = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(reward_amount), 0) AS total
       FROM governance_rewards
       WHERE voter_address = $1
         AND created_at >= $2`,
      [creatorAddress, since]
    );
    return (result.rows[0]?.total ?? "0").toString();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist") || msg.includes("relation")) return "0";
    throw err;
  }
}

async function queryTopTippers(db: Pool, creatorAddress: string): Promise<TopTipper[]> {
  const result = await db.query<{ tipper: string; total_amount: string; tip_count: string }>(
    `SELECT
       t.tipper,
       SUM(t.amount) AS total_amount,
       COUNT(t.id)   AS tip_count
     FROM tips t
     JOIN posts p ON p.id = t.post_id
     WHERE p.author = $1
       AND p.deleted_at IS NULL
     GROUP BY t.tipper
     ORDER BY total_amount DESC
     LIMIT 5`,
    [creatorAddress]
  );
  return result.rows.map((r) => ({
    address: r.tipper,
    totalAmount: r.total_amount,
    tipCount: Number(r.tip_count),
  }));
}

async function queryEarningsByDay(db: Pool, creatorAddress: string): Promise<DailyEarning[]> {
  const since = daysAgo(30);
  const result = await db.query<{ day: string; amount: string }>(
    `SELECT
       DATE_TRUNC('day', t.created_at)::date::text AS day,
       COALESCE(SUM(t.amount), 0)                  AS amount
     FROM tips t
     JOIN posts p ON p.id = t.post_id
     WHERE p.author = $1
       AND p.deleted_at IS NULL
       AND t.created_at >= $2
     GROUP BY day
     ORDER BY day ASC`,
    [creatorAddress, since]
  );
  return result.rows.map((r) => ({ date: r.day, amount: r.amount }));
}

async function creatorExists(db: Pool, creatorAddress: string): Promise<boolean> {
  const result = await db.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM posts   WHERE author   = $1
       UNION ALL
       SELECT 1 FROM follows WHERE followee = $1
       LIMIT 1
     ) AS exists`,
    [creatorAddress]
  );
  return result.rows[0]?.exists ?? false;
}

// ── Router ────────────────────────────────────────────────────────────────────

export function createEarningsRouter(db: Pool): Router {
  const router = Router();

  /**
   * GET /analytics/creators/:accountId/earnings
   *
   * Returns a full earnings dashboard for the given Stellar creator account.
   * All three time-period breakdowns are returned in a single response.
   * p95 latency target: <200 ms (all sub-queries run in parallel).
   */
  router.get(
    "/creators/:accountId/earnings",
    validateParams(accountParamsSchema),
    async (req: Request, res: Response): Promise<void> => {
      const { accountId } = req.params;
      const requestId = (req as Request & { requestId?: string }).requestId;

      try {
        const exists = await creatorExists(db, accountId);
        if (!exists) {
          const err = notFoundError("Creator not found");
          res.status(err.statusCode).json(err.toJSON(requestId));
          return;
        }

        const epoch = new Date(0);
        const w7d = daysAgo(7);
        const w30d = daysAgo(30);

        // All queries run concurrently to hit the p95 <200 ms target.
        const [
          tips7d, tips30d, tipsAll,
          fees7d, fees30d, feesAll,
          gov7d, gov30d, govAll,
          topTippers,
          earningsByDay,
        ] = await Promise.all([
          queryTipsSince(db, accountId, w7d),
          queryTipsSince(db, accountId, w30d),
          queryTipsSince(db, accountId, epoch),
          queryPoolFeesSince(db, accountId, w7d),
          queryPoolFeesSince(db, accountId, w30d),
          queryPoolFeesSince(db, accountId, epoch),
          queryGovernanceRewardsSince(db, accountId, w7d),
          queryGovernanceRewardsSince(db, accountId, w30d),
          queryGovernanceRewardsSince(db, accountId, epoch),
          queryTopTippers(db, accountId),
          queryEarningsByDay(db, accountId),
        ]);

        const dashboard: EarningsDashboard = {
          accountId,
          totalTips:         { sevenDay: tips7d, thirtyDay: tips30d, allTime: tipsAll },
          poolFees:          { sevenDay: fees7d, thirtyDay: fees30d, allTime: feesAll },
          governanceRewards: { sevenDay: gov7d,  thirtyDay: gov30d,  allTime: govAll  },
          topTippers,
          earningsByDay,
          computedAt: new Date().toISOString(),
        };

        logger.info({ accountId, requestId }, "Creator earnings dashboard computed");
        res.json(dashboard);
      } catch (err) {
        logger.error({ accountId, requestId, err }, "Failed to compute creator earnings");
        if (isAppError(err as Error)) {
          const appErr = err as { statusCode: number; toJSON: (id?: string) => object };
          res.status(appErr.statusCode).json(appErr.toJSON(requestId));
          return;
        }
        const fallback = internalError("Failed to compute creator earnings");
        res.status(fallback.statusCode).json(fallback.toJSON(requestId));
      }
    }
  );

  return router;
}
