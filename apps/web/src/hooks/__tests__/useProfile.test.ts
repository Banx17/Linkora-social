/**
 * @jest-environment jsdom
 *
 * Focused tests for the verification fields exposed by `useProfile`.
 * The hook pulls its on-chain data through the deep relative SDK client
 * import, so that path is mocked here.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { useProfile } from "../useProfile";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const getProfile = jest.fn();
const getAnalyticsAttestation = jest.fn();

jest.mock("../../../../../packages/sdk/src/client", () => ({
  LinkoraClient: jest.fn().mockImplementation(() => ({
    getProfile: (...args: unknown[]) => getProfile(...args),
    getAnalyticsAttestation: (...args: unknown[]) => getAnalyticsAttestation(...args),
  })),
}));

function mockFetch() {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ total: 0, posts: [], has_more: false }),
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch();
  getProfile.mockResolvedValue({
    address: "GABC1234",
    username: "alice",
    creator_token: "",
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useProfile — verification", () => {
  it("exposes isVerified=true and verificationLevel when an attestation exists", async () => {
    getAnalyticsAttestation.mockResolvedValue({
      creator: "GABC1234",
      oracleName: "linkora-oracle",
      reportHash: "hash",
      windowStart: 1,
      windowEnd: 2,
    });

    const { result } = renderHook(() => useProfile("GABC1234"));

    await waitFor(() => expect(result.current.state.status).toBe("success"));

    if (result.current.state.status !== "success") throw new Error("unreachable");
    expect(getAnalyticsAttestation).toHaveBeenCalledWith("GABC1234");
    expect(result.current.state.data.isVerified).toBe(true);
    expect(result.current.state.data.verificationLevel).toBe("identity");
  });

  it("exposes isVerified=false and verificationLevel=null without an attestation", async () => {
    getAnalyticsAttestation.mockResolvedValue(null);

    const { result } = renderHook(() => useProfile("GABC1234"));

    await waitFor(() => expect(result.current.state.status).toBe("success"));

    if (result.current.state.status !== "success") throw new Error("unreachable");
    expect(result.current.state.data.isVerified).toBe(false);
    expect(result.current.state.data.verificationLevel).toBeNull();
  });

  it("treats an attestation lookup failure as unverified without erroring the profile", async () => {
    getAnalyticsAttestation.mockRejectedValue(new Error("RPC down"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => useProfile("GABC1234"));

    await waitFor(() => expect(result.current.state.status).toBe("success"));

    if (result.current.state.status !== "success") throw new Error("unreachable");
    expect(result.current.state.data.isVerified).toBe(false);
    expect(result.current.state.data.verificationLevel).toBeNull();
    warn.mockRestore();
  });
});
