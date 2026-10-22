import pino from "pino";
import { v4 as uuidv4 } from "uuid";
import { Request, Response, NextFunction } from "express";

// ── Logger setup ──────────────────────────────────────────────────────────────

const isDev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";

/**
 * Singleton Pino logger for the indexer service (Issue #1757).
 *
 * - Structured JSON output with ISO timestamps in production/test.
 * - pino-pretty transport in development for human-readable output.
 * - Sensitive fields (Authorization headers, passwords, wallet private keys)
 *   are redacted at all log levels via Pino's built-in redact option.
 * - Every request is tagged with a `correlationId` (UUID v4) propagated
 *   from the X-Correlation-ID request header (or generated if absent).
 */
const pinoLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "indexer" },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive fields at all log levels so they never appear in logs.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.Authorization",
      "*.password",
      "*.privateKey",
      "*.private_key",
      "*.secret",
      "*.walletKey",
      "*.wallet_key",
      "*.seed",
    ],
    censor: "[REDACTED]",
  },
  ...(isDev && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, ignore: "pid,hostname", translateTime: "SYS:standard" },
    },
  }),
});

export const logger = pinoLogger;

// ── Request context with correlation ID ──────────────────────────────────────
//
// Every incoming request is tagged with a `correlationId` (UUID v4).
// The value is taken from the X-Correlation-ID request header when provided
// (so upstream services can propagate their own ID) or generated fresh.
// It is echoed back in the X-Correlation-ID response header and included in
// every log entry produced during the request so that all log lines for a
// single request can be correlated in a log aggregator.

interface RequestContext {
  requestId: string;
  /** Alias for requestId — preferred name per issue #1757. */
  correlationId: string;
  startTime: number;
  stellarAddress?: string;
  userId?: string;
  ipAddress?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

// ── Abuse tracking (simple in-memory store) ──────────────────────────────────

export interface AbuseEntry {
  count: number;
  windowStart: number;
}

export const MAX_ABUSE_ENTRIES = 1000;
export const ABUSE_THRESHOLD = 5; // 5 429s in 60s = abuse
export const ABUSE_WINDOW_MS = 60_000;

export const abuseTracker = new Map<string, AbuseEntry>();

export function clearAbuseTracker(): void {
  abuseTracker.clear();
}

export function recordAbuseAttempt(ipAddress: string): void {
  const now = Date.now();
  const entry = abuseTracker.get(ipAddress);

  if (!entry || now - entry.windowStart > ABUSE_WINDOW_MS) {
    if (!entry && abuseTracker.size >= MAX_ABUSE_ENTRIES) {
      // First pass: clean up expired entries
      for (const [key, val] of abuseTracker.entries()) {
        if (now - val.windowStart > ABUSE_WINDOW_MS) {
          abuseTracker.delete(key);
        }
      }
      // If still at or over capacity, evict the oldest entry (LRU)
      if (abuseTracker.size >= MAX_ABUSE_ENTRIES) {
        const oldestKey = abuseTracker.keys().next().value;
        if (oldestKey !== undefined) {
          abuseTracker.delete(oldestKey);
        }
      }
    }
    abuseTracker.set(ipAddress, { count: 1, windowStart: now });
  } else {
    entry.count++;
    // Re-insert to keep LRU order updated
    abuseTracker.delete(ipAddress);
    abuseTracker.set(ipAddress, entry);
    if (entry.count > ABUSE_THRESHOLD) {
      logger.error(
        {
          ipAddress,
          count: entry.count,
          windowSeconds: Math.floor(ABUSE_WINDOW_MS / 1000),
        },
        "Abuse pattern detected: excessive 429 responses"
      );
    }
  }
}

import { getClientIP } from "./middleware/rateLimit";

// ── Request logging middleware ────────────────────────────────────────────────
//
// Attaches a correlationId to every request (issue #1757):
//   - Reads X-Correlation-ID from the incoming request if present, otherwise
//     generates a fresh UUID v4.
//   - Stores it in req.context so it can be propagated through all service
//     calls and included in every log entry.
//   - Echoes it back in the X-Correlation-ID response header.
//   - Logs request start (method, path, correlationId) and completion
//     (method, path, status, latency, correlationId).

export function requestLoggingMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Honour a correlation ID sent by an upstream proxy/gateway, or mint a new one.
  const incomingCorrelationId = req.headers["x-correlation-id"];
  const correlationId =
    typeof incomingCorrelationId === "string" && incomingCorrelationId.trim().length > 0
      ? incomingCorrelationId.trim()
      : uuidv4();

  const startTime = Date.now();
  const ipAddress = getClientIP(req);

  req.context = { requestId: correlationId, correlationId, startTime, ipAddress };

  // Echo the correlation ID so callers can match their own request.
  res.setHeader("X-Correlation-ID", correlationId);

  logger.info(
    { correlationId, method: req.method, path: req.path, ipAddress },
    "Incoming request"
  );

  // Capture the response end to log completion with latency.
  const originalSend = res.send;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.send = function (data: any) {
    const duration = Date.now() - startTime;
    const userId = req.context?.stellarAddress ?? req.context?.userId;
    const logData = {
      correlationId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ipAddress,
      ...(userId && { userId }),
    };

    if (duration > 500) {
      logger.warn(logData, "Slow request");
    } else {
      logger.info(logData, "Request completed");
    }

    if (res.statusCode === 429) {
      recordAbuseAttempt(ipAddress);
    }

    return originalSend.call(this, data);
  };

  next();
}

// ── Query duration logging helper ─────────────────────────────────────────────
//
// Wrap a database query so the elapsed time is logged at DEBUG level with the
// correlationId of the request that triggered it (issue #1757).
//
// Usage:
//   const rows = await loggedQuery(db, 'SELECT …', params, correlationId);

export async function loggedQuery<T>(
  queryFn: () => Promise<T>,
  label: string,
  correlationId?: string
): Promise<T> {
  const start = Date.now();
  try {
    const result = await queryFn();
    const duration = Date.now() - start;
    logger.debug({ correlationId, query: label, duration }, "Database query completed");
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    logger.error({ correlationId, query: label, duration, err }, "Database query failed");
    throw err;
  }
}

// ── Health check state ────────────────────────────────────────────────────────

interface HealthState {
  dbConnected: boolean;
  rpcConnected: boolean;
  startTime: number;
}

export const healthState: HealthState = {
  dbConnected: false,
  rpcConnected: false,
  startTime: Date.now(),
};

export function getHealth() {
  const uptime = Math.floor((Date.now() - healthState.startTime) / 1000);
  return {
    status: healthState.dbConnected && healthState.rpcConnected ? "ok" : "degraded",
    uptime,
    dbConnected: healthState.dbConnected,
    rpcConnected: healthState.rpcConnected,
  };
}

export default logger;
