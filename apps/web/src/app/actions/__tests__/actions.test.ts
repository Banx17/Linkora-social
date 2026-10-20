/**
 * Server Action unit tests (issue #1738).
 *
 * Only the validation / error branches are exercised here — the happy path for
 * tipping and following needs a live Soroban RPC, which is covered end to end
 * instead.
 */

jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

import { createPostAction } from "../post";
import { followAction, unfollowAction } from "../follow";
import { sendTipAction } from "../tip";
import { submitSignedXdrAction } from "../tx";
import { initialActionState } from "../types";

const VALID_ADDRESS = "G" + "A".repeat(55);
const VALID_TOKEN = "C" + "B".repeat(55);

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

afterEach(() => {
  mockFetch.mockReset();
});

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  Object.entries(entries).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("createPostAction", () => {
  it("rejects empty content", async () => {
    const state = await createPostAction(initialActionState, formData({ content: "   " }));

    expect(state.status).toBe("error");
    expect(state.message).toBe("Post content cannot be empty.");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("requires a connected wallet", async () => {
    const state = await createPostAction(initialActionState, formData({ content: "hello" }));

    expect(state.status).toBe("error");
    expect(state.message).toContain("Connect your wallet");
  });

  it("persists sanitised content server-side and returns the post id", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 42, transactionHash: "abc" }),
    });

    const state = await createPostAction(
      initialActionState,
      formData({ content: "<script>alert(1)</script>hello", author: VALID_ADDRESS })
    );

    expect(state.status).toBe("success");
    expect(state.postId).toBe("42");
    expect(state.txHash).toBe("abc");
    expect(JSON.parse(String(mockFetch.mock.calls[0][1].body))).toEqual({
      content: "hello",
      author: VALID_ADDRESS,
    });
  });

  it("surfaces indexer failures", async () => {
    mockFetch.mockResolvedValue({ ok: false, statusText: "Bad Gateway" });

    const state = await createPostAction(
      initialActionState,
      formData({ content: "hello", author: VALID_ADDRESS })
    );

    expect(state.status).toBe("error");
    expect(state.message).toBe("Failed to submit post: Bad Gateway");
  });
});

describe("sendTipAction", () => {
  it("requires a valid token address", async () => {
    const state = await sendTipAction(
      initialActionState,
      formData({ tipper: VALID_ADDRESS, token: "nope", amount: "1", postId: "1" })
    );

    expect(state.status).toBe("error");
    expect(state.message).toContain("valid Stellar address");
  });

  it("requires a positive post id", async () => {
    const state = await sendTipAction(
      initialActionState,
      formData({ tipper: VALID_ADDRESS, token: VALID_TOKEN, amount: "1", postId: "0" })
    );

    expect(state.status).toBe("error");
    expect(state.message).toBe("Post id must be a positive integer.");
  });

  it("requires a positive amount", async () => {
    const state = await sendTipAction(
      initialActionState,
      formData({ tipper: VALID_ADDRESS, token: VALID_TOKEN, amount: "0", postId: "1" })
    );

    expect(state.status).toBe("error");
    expect(state.message).toBe("Amount must be greater than zero.");
  });
});

describe("followAction", () => {
  it("rejects self-follows", async () => {
    const state = await followAction(
      initialActionState,
      formData({ follower: VALID_ADDRESS, followee: VALID_ADDRESS })
    );

    expect(state.status).toBe("error");
    expect(state.message).toBe("You cannot follow yourself.");
  });

  it("rejects malformed addresses", async () => {
    const state = await unfollowAction(
      initialActionState,
      formData({ follower: VALID_ADDRESS, followee: "short" })
    );

    expect(state.status).toBe("error");
    expect(state.message).toContain("valid Stellar address");
  });
});

describe("submitSignedXdrAction", () => {
  it("rejects an empty envelope", async () => {
    const state = await submitSignedXdrAction(initialActionState, formData({}));

    expect(state.status).toBe("error");
    expect(state.message).toBe("Missing signed transaction.");
  });
});
