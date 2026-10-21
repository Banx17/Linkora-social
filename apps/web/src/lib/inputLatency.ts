/**
 * Keystroke-to-paint latency measurement with the Performance API (#1747).
 *
 * For each input event we take the event's own timestamp (when the browser
 * received the keystroke) and wait for the frame that renders it:
 * `requestAnimationFrame` runs right before the next paint, and a task queued
 * from inside it runs right after that paint. The difference is recorded as a
 * `performance.measure()` entry, so it also shows up in the DevTools
 * Performance panel under "Timings".
 *
 * Budget: one 60 Hz frame (16 ms). `summarizeInputLatency()` reports p50 /
 * p95 / max over the recorded entries for before/after comparisons.
 */

export const INPUT_LATENCY_BUDGET_MS = 16;

export interface InputLatencySummary {
  count: number;
  p50: number;
  p95: number;
  max: number;
  /** Share of keystrokes that painted within the budget (0..1). */
  withinBudget: number;
}

/**
 * Picks the most accurate start time for an input event. `Event.timeStamp` is
 * a high-resolution time on the same clock as `performance.now()` in modern
 * browsers; anything else (0, epoch milliseconds, the future) falls back to
 * "now", which slightly under-reports but never inflates.
 */
export function resolveStartTime(eventTimeStamp: number | undefined, now: number): number {
  if (eventTimeStamp && eventTimeStamp > 0 && eventTimeStamp <= now) return eventTimeStamp;
  return now;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function summarizeInputLatency(
  durations: number[],
  budgetMs = INPUT_LATENCY_BUDGET_MS
): InputLatencySummary {
  const sorted = [...durations].sort((a, b) => a - b);
  const count = sorted.length;

  return {
    count,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: count ? sorted[count - 1] : 0,
    withinBudget: count ? sorted.filter((d) => d <= budgetMs).length / count : 1,
  };
}

/** Summary of every latency measure recorded so far under `name`. */
export function getInputLatencySummary(
  name: string,
  budgetMs = INPUT_LATENCY_BUDGET_MS
): InputLatencySummary {
  if (typeof performance === "undefined" || typeof performance.getEntriesByName !== "function") {
    return summarizeInputLatency([], budgetMs);
  }
  const durations = performance.getEntriesByName(name, "measure").map((entry) => entry.duration);
  return summarizeInputLatency(durations, budgetMs);
}

function recordMeasure(name: string, start: number, end: number): void {
  try {
    performance.measure(name, { start, end });
  } catch {
    // Older engines (and jsdom) lack the options form; the callback still
    // receives the duration.
  }
}

/**
 * Measures how long the keystroke that fired at `eventTimeStamp` takes to
 * reach the screen. Calls `onMeasure` with the duration in milliseconds.
 * No-op outside the browser.
 */
export function measureKeystrokeToPaint(
  name: string,
  eventTimeStamp: number | undefined,
  onMeasure?: (durationMs: number) => void
): void {
  if (
    typeof window === "undefined" ||
    typeof performance === "undefined" ||
    typeof window.requestAnimationFrame !== "function"
  ) {
    return;
  }

  const start = resolveStartTime(eventTimeStamp, performance.now());

  window.requestAnimationFrame(() => {
    // Runs after the frame scheduled above has painted.
    setTimeout(() => {
      const end = performance.now();
      recordMeasure(name, start, end);
      onMeasure?.(end - start);
    }, 0);
  });
}
