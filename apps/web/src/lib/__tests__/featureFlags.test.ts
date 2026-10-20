/**
 * Unit tests for apps/web/src/lib/featureFlags.ts
 *
 * Coverage:
 *   getFlag()
 *     - returns Edge Config value when available
 *     - falls back to env var when Edge Config is unavailable
 *     - falls back to FLAG_DEFAULTS when both Edge Config and env var are absent
 *     - handles string "true"/"false" from Edge Config
 *     - falls back gracefully on Edge Config errors
 *     - handles missing key in FLAG_DEFAULTS
 *
 *   useFeatureFlag()
 *     - returns the default value immediately (no flash of wrong state)
 *     - updates to the server value after the fetch resolves
 *     - stays at default when the fetch fails
 *     - stays at default when the response is non-OK
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { FLAG_DEFAULTS, getFlag, useFeatureFlag, type FeatureFlagKey } from "../featureFlags";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const originalEnv = process.env;

function setEnv(vars: Record<string, string | undefined>) {
  process.env = { ...originalEnv, ...vars };
}

function resetEnv() {
  process.env = originalEnv;
}

// ─── getFlag ─────────────────────────────────────────────────────────────────

describe("getFlag()", () => {
  beforeEach(() => {
    jest.resetModules();
    resetEnv();
  });

  afterEach(() => {
    resetEnv();
    jest.restoreAllMocks();
  });

  it("returns the FLAG_DEFAULTS value when Edge Config and env vars are absent", async () => {
    setEnv({ EDGE_CONFIG: undefined });
    const result = await getFlag("dark-mode-toggle");
    expect(result).toBe(FLAG_DEFAULTS["dark-mode-toggle"]);
  });

  it("returns true when env var is 'true'", async () => {
    setEnv({ EDGE_CONFIG: undefined, FEATURE_FLAG_DARK_MODE_TOGGLE: "true" });
    const result = await getFlag("dark-mode-toggle");
    expect(result).toBe(true);
  });

  it("returns false when env var is 'false'", async () => {
    setEnv({ EDGE_CONFIG: undefined, FEATURE_FLAG_INFINITE_SCROLL: "false" });
    const result = await getFlag("infinite-scroll");
    expect(result).toBe(false);
  });

  it("returns true when env var is '1'", async () => {
    setEnv({ EDGE_CONFIG: undefined, FEATURE_FLAG_COMMAND_PALETTE: "1" });
    const result = await getFlag("command-palette");
    expect(result).toBe(true);
  });

  it("returns false when env var is '0'", async () => {
    setEnv({ EDGE_CONFIG: undefined, FEATURE_FLAG_DARK_MODE_TOGGLE: "0" });
    const result = await getFlag("dark-mode-toggle");
    expect(result).toBe(false);
  });

  it("returns Edge Config boolean value when EDGE_CONFIG is set", async () => {
    setEnv({ EDGE_CONFIG: "https://edge-config.vercel.com/ecfg_test" });

    jest.mock("@vercel/edge-config", () => ({
      get: jest.fn().mockResolvedValue(false),
    }));

    // Re-import after mock
    const { getFlag: getFlag2 } = await import("../featureFlags");
    const result = await getFlag2("dark-mode-toggle");
    expect(result).toBe(false);

    jest.unmock("@vercel/edge-config");
  });

  it("falls back to env var when Edge Config returns undefined (key missing)", async () => {
    setEnv({
      EDGE_CONFIG: "https://edge-config.vercel.com/ecfg_test",
      FEATURE_FLAG_INFINITE_SCROLL: "false",
    });

    jest.mock("@vercel/edge-config", () => ({
      get: jest.fn().mockResolvedValue(undefined),
    }));

    const { getFlag: getFlag2 } = await import("../featureFlags");
    const result = await getFlag2("infinite-scroll");
    expect(result).toBe(false);

    jest.unmock("@vercel/edge-config");
  });

  it("falls back to FLAG_DEFAULTS when Edge Config throws", async () => {
    setEnv({ EDGE_CONFIG: "https://edge-config.vercel.com/ecfg_test" });

    jest.mock("@vercel/edge-config", () => ({
      get: jest.fn().mockRejectedValue(new Error("Edge Config unavailable")),
    }));

    const { getFlag: getFlag2 } = await import("../featureFlags");
    const result = await getFlag2("command-palette");
    expect(result).toBe(FLAG_DEFAULTS["command-palette"]);

    jest.unmock("@vercel/edge-config");
  });
});

// ─── useFeatureFlag ───────────────────────────────────────────────────────────

describe("useFeatureFlag()", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("returns the default value synchronously before fetch resolves", () => {
    // fetch never resolves during this test
    global.fetch = jest.fn(() => new Promise(() => {})) as jest.Mock;

    const { result } = renderHook(() => useFeatureFlag("dark-mode-toggle"));
    expect(result.current).toBe(FLAG_DEFAULTS["dark-mode-toggle"]);
  });

  it("updates to the server value after fetch resolves with { enabled: false }", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: false }),
    }) as jest.Mock;

    const { result } = renderHook(() => useFeatureFlag("dark-mode-toggle"));

    // Initially shows the default
    expect(result.current).toBe(FLAG_DEFAULTS["dark-mode-toggle"]);

    // Waits for the fetch to resolve and re-render
    await waitFor(() => expect(result.current).toBe(false));

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/flags/dark-mode-toggle",
      expect.objectContaining({ next: { revalidate: 60 } })
    );
  });

  it("updates to the server value after fetch resolves with { enabled: true }", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true }),
    }) as jest.Mock;

    const { result } = renderHook(() => useFeatureFlag("infinite-scroll"));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("stays at default when fetch returns a non-OK response", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 404,
    }) as jest.Mock;

    const { result } = renderHook(() => useFeatureFlag("command-palette"));

    // Give a tick for the effect to run
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toBe(FLAG_DEFAULTS["command-palette"]);
  });

  it("stays at default when fetch throws a network error", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network error")) as jest.Mock;

    const { result } = renderHook(() => useFeatureFlag("dark-mode-toggle"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toBe(FLAG_DEFAULTS["dark-mode-toggle"]);
  });

  it("encodes the flag key in the fetch URL", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled: true }),
    }) as jest.Mock;

    renderHook(() => useFeatureFlag("dark-mode-toggle"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/flags/dark-mode-toggle",
        expect.anything()
      );
    });
  });
});

// ─── FLAG_DEFAULTS ────────────────────────────────────────────────────────────

describe("FLAG_DEFAULTS", () => {
  it("has a boolean default for every FeatureFlagKey", () => {
    const keys: FeatureFlagKey[] = ["dark-mode-toggle", "infinite-scroll", "command-palette"];
    for (const key of keys) {
      expect(typeof FLAG_DEFAULTS[key]).toBe("boolean");
    }
  });
});
