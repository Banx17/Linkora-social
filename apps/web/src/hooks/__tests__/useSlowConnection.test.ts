/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from "@testing-library/react";

import {
  isSlowConnection,
  useSlowConnection,
  type NetworkInformationLike,
} from "../useSlowConnection";

type ChangeListener = () => void;

interface MockConnection extends NetworkInformationLike {
  effectiveType: string;
  saveData: boolean;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  listeners: Set<ChangeListener>;
  setEffectiveType: (type: string) => void;
}

function installConnection(
  initial: { effectiveType?: string; saveData?: boolean } = {}
): MockConnection {
  const listeners = new Set<ChangeListener>();

  const connection = {
    effectiveType: initial.effectiveType ?? "4g",
    saveData: initial.saveData ?? false,
    listeners,
    addEventListener: jest.fn((_type: string, listener: ChangeListener) => {
      listeners.add(listener);
    }),
    removeEventListener: jest.fn((_type: string, listener: ChangeListener) => {
      listeners.delete(listener);
    }),
    setEffectiveType(type: string) {
      connection.effectiveType = type;
      listeners.forEach((listener) => listener());
    },
  } as MockConnection;

  Object.defineProperty(navigator, "connection", {
    configurable: true,
    value: connection,
  });

  return connection;
}

afterEach(() => {
  delete (navigator as Navigator & { connection?: unknown }).connection;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("isSlowConnection (#1724)", () => {
  it("returns false when the Network Information API is unavailable", () => {
    expect(isSlowConnection(undefined)).toBe(false);
  });

  it.each(["slow-2g", "2g"])("treats %s as slow", (effectiveType) => {
    expect(isSlowConnection({ effectiveType })).toBe(true);
  });

  it.each(["3g", "4g"])("treats %s as fast enough", (effectiveType) => {
    expect(isSlowConnection({ effectiveType })).toBe(false);
  });

  it("treats saveData as slow even on a fast connection", () => {
    expect(isSlowConnection({ effectiveType: "4g", saveData: true })).toBe(true);
  });
});

describe("useSlowConnection (#1724)", () => {
  it("returns false when the API is unavailable", () => {
    const { result } = renderHook(() => useSlowConnection());

    expect(result.current).toBe(false);
  });

  it("detects a 2g connection on mount", () => {
    installConnection({ effectiveType: "2g" });

    const { result } = renderHook(() => useSlowConnection());

    expect(result.current).toBe(true);
  });

  it("reacts to connection changes and unsubscribes on unmount", async () => {
    const connection = installConnection({ effectiveType: "4g" });

    const { result, unmount } = renderHook(() => useSlowConnection());
    expect(result.current).toBe(false);

    act(() => connection.setEffectiveType("slow-2g"));

    await waitFor(() => expect(result.current).toBe(true));

    unmount();
    expect(connection.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(connection.listeners.size).toBe(0);
  });
});
