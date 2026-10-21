/**
 * @jest-environment jsdom
 */

import { renderHook } from "@testing-library/react";

import { useInputLatency } from "../useInputLatency";
import * as inputLatency from "@/lib/inputLatency";

describe("useInputLatency (#1747)", () => {
  let measureSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let nextDuration: number;

  beforeEach(() => {
    nextDuration = 0;
    measureSpy = jest
      .spyOn(inputLatency, "measureKeystrokeToPaint")
      .mockImplementation((_name, _timeStamp, onMeasure) => onMeasure?.(nextDuration));
    jest
      .spyOn(inputLatency, "getInputLatencySummary")
      .mockReturnValue({ count: 3, p50: 6, p95: 24, max: 24, withinBudget: 2 / 3 });
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("is a no-op when disabled (the default outside next dev)", () => {
    const { result } = renderHook(() => useInputLatency({ name: "search-input-latency" }));

    result.current({ timeStamp: 10 });

    expect(measureSpy).not.toHaveBeenCalled();
  });

  it("measures each keystroke and reports the duration", () => {
    const onMeasure = jest.fn();
    nextDuration = 7;
    const { result } = renderHook(() =>
      useInputLatency({ name: "search-input-latency", enabled: true, onMeasure })
    );

    result.current({ timeStamp: 10 });

    expect(measureSpy).toHaveBeenCalledWith("search-input-latency", 10, expect.any(Function));
    expect(onMeasure).toHaveBeenCalledWith(7);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("warns when a keystroke misses the 16ms budget", () => {
    nextDuration = 24;
    const { result } = renderHook(() =>
      useInputLatency({ name: "search-input-latency", enabled: true })
    );

    result.current({ timeStamp: 10 });

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("took 24.0ms to paint"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("budget 16ms"));
  });

  it("keeps a stable handler across re-renders", () => {
    const { result, rerender } = renderHook(
      ({ onMeasure }) =>
        useInputLatency({ name: "search-input-latency", enabled: true, onMeasure }),
      { initialProps: { onMeasure: jest.fn() } }
    );
    const first = result.current;

    rerender({ onMeasure: jest.fn() });

    expect(result.current).toBe(first);
  });
});
