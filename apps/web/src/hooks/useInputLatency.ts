"use client";

/**
 * Dev-only keystroke-to-paint latency probe for text inputs (#1747).
 *
 * Returns a callback to call from an input's `onChange`. Each keystroke is
 * recorded as a `performance.measure(name)` entry; keystrokes that miss the
 * 16 ms frame budget are logged with `console.warn`, together with a running
 * p50 / p95 summary. Enabled only under `next dev` by default; a no-op in production and tests.
 */

import { useCallback, useEffect, useRef } from "react";

import {
  INPUT_LATENCY_BUDGET_MS,
  getInputLatencySummary,
  measureKeystrokeToPaint,
} from "@/lib/inputLatency";

interface UseInputLatencyOptions {
  /** `performance.measure` entry name. */
  name: string;
  budgetMs?: number;
  enabled?: boolean;
  /** Receives every measured duration (ms). */
  onMeasure?: (durationMs: number) => void;
}

export function useInputLatency({
  name,
  budgetMs = INPUT_LATENCY_BUDGET_MS,
  enabled = process.env.NODE_ENV === "development",
  onMeasure,
}: UseInputLatencyOptions): (event?: { timeStamp?: number }) => void {
  // Read through a ref so a new `onMeasure` identity never re-creates the
  // returned handler (and so never re-renders the input).
  const onMeasureRef = useRef(onMeasure);
  useEffect(() => {
    onMeasureRef.current = onMeasure;
  }, [onMeasure]);

  return useCallback(
    (event?: { timeStamp?: number }) => {
      if (!enabled) return;

      measureKeystrokeToPaint(name, event?.timeStamp, (duration) => {
        onMeasureRef.current?.(duration);

        if (duration > budgetMs) {
          const { p50, p95, count } = getInputLatencySummary(name, budgetMs);
          console.warn(
            `[${name}] keystroke took ${duration.toFixed(1)}ms to paint ` +
              `(budget ${budgetMs}ms; p50 ${p50.toFixed(1)}ms, p95 ${p95.toFixed(1)}ms over ${count})`
          );
        }
      });
    },
    [budgetMs, enabled, name]
  );
}
