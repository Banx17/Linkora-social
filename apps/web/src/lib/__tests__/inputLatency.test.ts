/**
 * @jest-environment jsdom
 */

import {
  INPUT_LATENCY_BUDGET_MS,
  measureKeystrokeToPaint,
  resolveStartTime,
  summarizeInputLatency,
} from "../inputLatency";

describe("resolveStartTime (#1747)", () => {
  it("uses the event timestamp when it is on the performance clock", () => {
    expect(resolveStartTime(90, 100)).toBe(90);
  });

  it.each([
    ["missing", undefined],
    ["zero", 0],
    ["in the future (epoch ms)", 1_700_000_000_000],
  ])("falls back to now when the timestamp is %s", (_label, timeStamp) => {
    expect(resolveStartTime(timeStamp, 100)).toBe(100);
  });
});

describe("summarizeInputLatency (#1747)", () => {
  it("reports an empty summary as within budget", () => {
    expect(summarizeInputLatency([])).toEqual({
      count: 0,
      p50: 0,
      p95: 0,
      max: 0,
      withinBudget: 1,
    });
  });

  it("computes percentiles and the share within the 16ms budget", () => {
    const durations = [4, 8, 12, 2, 6, 10, 14, 30, 5, 9];
    const summary = summarizeInputLatency(durations);

    expect(INPUT_LATENCY_BUDGET_MS).toBe(16);
    expect(summary.count).toBe(10);
    expect(summary.p50).toBe(8);
    expect(summary.p95).toBe(30);
    expect(summary.max).toBe(30);
    expect(summary.withinBudget).toBeCloseTo(0.9);
  });
});

describe("measureKeystrokeToPaint (#1747)", () => {
  let rafCallbacks: FrameRequestCallback[];
  let now: number;

  beforeEach(() => {
    jest.useFakeTimers();
    // jsdom does not implement performance.measure; stub it on the (faked)
    // performance object installed above.
    performance.measure = jest.fn() as unknown as Performance["measure"];
    rafCallbacks = [];
    now = 100;
    jest.spyOn(performance, "now").mockImplementation(() => now);
    jest.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("measures from the keystroke to after the next paint", () => {
    const measure = performance.measure as unknown as jest.Mock;
    const onMeasure = jest.fn();

    measureKeystrokeToPaint("search-input-latency", 95, onMeasure);
    expect(onMeasure).not.toHaveBeenCalled();

    // The frame is painted 8ms later; the post-paint task reads the clock.
    now = 108;
    rafCallbacks.forEach((callback) => callback(now));
    jest.runOnlyPendingTimers();

    expect(onMeasure).toHaveBeenCalledWith(13);
    expect(measure).toHaveBeenCalledWith("search-input-latency", { start: 95, end: 108 });
  });

  it("still reports the duration when performance.measure is unsupported", () => {
    (performance.measure as unknown as jest.Mock).mockImplementation(() => {
      throw new TypeError("options are not supported");
    });
    const onMeasure = jest.fn();

    measureKeystrokeToPaint("search-input-latency", undefined, onMeasure);
    now = 104;
    rafCallbacks.forEach((callback) => callback(now));
    jest.runOnlyPendingTimers();

    expect(onMeasure).toHaveBeenCalledWith(4);
  });
});
