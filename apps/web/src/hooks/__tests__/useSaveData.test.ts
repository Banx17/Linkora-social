/**
 * @jest-environment jsdom
 */

import { act, renderHook, waitFor } from "@testing-library/react";

import { useSaveData, readSaveData } from "../useSaveData";
import { SAVE_DATA_COOKIE } from "@/lib/saveData";

type ChangeListener = () => void;

function installConnection(saveData: boolean) {
  const listeners = new Set<ChangeListener>();
  const connection = {
    effectiveType: "4g",
    saveData,
    addEventListener: jest.fn((_type: string, listener: ChangeListener) => {
      listeners.add(listener);
    }),
    removeEventListener: jest.fn((_type: string, listener: ChangeListener) => {
      listeners.delete(listener);
    }),
    listeners,
    setSaveData(value: boolean) {
      connection.saveData = value;
      listeners.forEach((listener) => listener());
    },
  };

  Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
  return connection;
}

afterEach(() => {
  delete (navigator as Navigator & { connection?: unknown }).connection;
  document.cookie = `${SAVE_DATA_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
});

describe("useSaveData (#1748)", () => {
  it("is false when neither signal is present", () => {
    const { result } = renderHook(() => useSaveData());
    expect(result.current).toBe(false);
  });

  it("reads navigator.connection.saveData", () => {
    installConnection(true);
    expect(readSaveData()).toBe(true);

    const { result } = renderHook(() => useSaveData());
    expect(result.current).toBe(true);
  });

  it("does not treat a slow connection alone as save-data", () => {
    const connection = installConnection(false);
    connection.effectiveType = "2g";

    const { result } = renderHook(() => useSaveData());
    expect(result.current).toBe(false);
  });

  it("falls back to the cookie mirrored from the Save-Data header", () => {
    document.cookie = `${SAVE_DATA_COOKIE}=1; path=/`;

    const { result } = renderHook(() => useSaveData());
    expect(result.current).toBe(true);
  });

  it("reacts to the user toggling data saver and unsubscribes on unmount", async () => {
    const connection = installConnection(false);

    const { result, unmount } = renderHook(() => useSaveData());
    expect(result.current).toBe(false);

    act(() => connection.setSaveData(true));
    await waitFor(() => expect(result.current).toBe(true));

    unmount();
    expect(connection.listeners.size).toBe(0);
  });
});
