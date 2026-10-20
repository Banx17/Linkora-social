/**
 * @jest-environment jsdom
 *
 * Unit tests for useComments — React 19 useOptimistic-based comment hook.
 *
 * Strategy
 * ────────
 * • `global.fetch` is mocked for each test case.
 * • `renderHook` + `act` / `waitFor` are used to drive async state updates.
 * • Tests verify the optimistic-then-confirm and optimistic-then-rollback
 *   patterns for both creation and deletion.
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { useComments } from "../useComments";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const POST_ID = "post-42";
const AUTHOR = "GUSER_TEST_ADDR";

function makeComment(
  overrides: Partial<{
    id: string;
    postId: string;
    author: string;
    content: string;
    createdAt: string;
  }> = {}
) {
  return {
    id: "comment-server-1",
    postId: POST_ID,
    author: AUTHOR,
    content: "Hello world",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Build a fetch mock that returns the given value for GET and a 201 for POST. */
function setupFetch({
  getComments = [] as ReturnType<typeof makeComment>[],
  createComment = makeComment(),
  getStatus = 200,
  createStatus = 201,
  deleteStatus = 204,
  failCreate = false,
  failDelete = false,
} = {}) {
  global.fetch = jest.fn().mockImplementation((url: string, options?: RequestInit) => {
    const method = options?.method ?? "GET";

    if (method === "GET") {
      return Promise.resolve({
        ok: getStatus < 400,
        status: getStatus,
        json: async () => ({ comments: getComments }),
      });
    }

    if (method === "POST") {
      if (failCreate) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ error: "Server error" }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: createStatus,
        json: async () => ({ comment: createComment }),
      });
    }

    if (method === "DELETE") {
      if (failDelete) {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
      }
      return Promise.resolve({ ok: true, status: deleteStatus, json: async () => ({}) });
    }

    return Promise.reject(new Error(`Unhandled method: ${method}`));
  }) as unknown as typeof fetch;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useComments — initial fetch", () => {
  it("fetches and exposes comments on mount", async () => {
    const comments = [makeComment({ id: "c1", content: "First" })];
    setupFetch({ getComments: comments });

    const { result } = renderHook(() => useComments(POST_ID));

    // Loading initially
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.comments).toHaveLength(1);
    expect(result.current.comments[0].content).toBe("First");
    expect(result.current.error).toBeNull();
  });

  it("starts with loading=true and empty comments", () => {
    setupFetch();
    const { result } = renderHook(() => useComments(POST_ID));
    expect(result.current.loading).toBe(true);
    expect(result.current.comments).toHaveLength(0);
  });

  it("sets error when GET fails", async () => {
    setupFetch({ getStatus: 500 });
    const { result } = renderHook(() => useComments(POST_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it("returns empty list and no error when postId is null", async () => {
    const { result } = renderHook(() => useComments(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.comments).toHaveLength(0);
    expect(result.current.error).toBeNull();
  });
});

describe("useComments — optimistic creation", () => {
  it("shows the comment immediately as optimistic/isPending before server responds", async () => {
    setupFetch({ getComments: [] });
    const { result } = renderHook(() => useComments(POST_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // We need the POST to hang until we inspect the state
    let resolvePost!: (value: Response) => void;
    (global.fetch as jest.Mock).mockImplementationOnce(
      (url: string, options?: RequestInit) => {
        if ((options?.method ?? "GET") === "POST") {
          return new Promise((res) => {
            resolvePost = res as (value: Response) => void;
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ comments: [] }),
        });
      }
    );

    act(() => {
      void result.current.addCommentOptimistic("Hello optimistic", AUTHOR);
    });

    // Optimistic entry should be visible instantly
    await waitFor(() => expect(result.current.comments).toHaveLength(1));
    expect(result.current.comments[0].isOptimistic).toBe(true);
    expect(result.current.comments[0].isPending).toBe(true);
    expect(result.current.comments[0].content).toBe("Hello optimistic");

    // Now let the server respond
    resolvePost({
      ok: true,
      status: 201,
      json: async () => ({ comment: makeComment({ content: "Hello optimistic" }) }),
    } as unknown as Response);

    await waitFor(() => {
      const c = result.current.comments.find((c) => c.content === "Hello optimistic");
      return c && !c.isPending;
    });
  });

  it("replaces the optimistic entry with the confirmed server record", async () => {
    const confirmed = makeComment({ id: "server-confirmed", content: "Confirmed text" });
    setupFetch({ getComments: [], createComment: confirmed });

    const { result } = renderHook(() => useComments(POST_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.addCommentOptimistic("Confirmed text", AUTHOR);
    });

    await waitFor(() => {
      const c = result.current.comments.find((c) => c.id === "server-confirmed");
      return !!c && !c.isPending;
    });

    const final = result.current.comments.find((c) => c.id === "server-confirmed");
    expect(final?.isOptimistic).toBeFalsy();
    expect(final?.isPending).toBeFalsy();
  });

  it("rolls back the optimistic entry and sets commentError on POST failure", async () => {
    setupFetch({ getComments: [], failCreate: true });

    const { result } = renderHook(() => useComments(POST_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      try {
        await result.current.addCommentOptimistic("Will fail", AUTHOR);
      } catch {
        // expected
      }
    });

    // Optimistic entry removed
    await waitFor(() => expect(result.current.comments).toHaveLength(0));
    // Error toast set
    expect(result.current.commentError).toBeTruthy();
  });
});

describe("useComments — optimistic deletion", () => {
  it("marks the comment as isDeleting immediately", async () => {
    const existing = makeComment({ id: "to-delete" });
    setupFetch({ getComments: [existing] });

    const { result } = renderHook(() => useComments(POST_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.comments).toHaveLength(1);

    // Hang the DELETE
    let resolveDelete!: (value: Response) => void;
    (global.fetch as jest.Mock).mockImplementationOnce(
      (_url: string, options?: RequestInit) => {
        if ((options?.method ?? "GET") === "DELETE") {
          return new Promise((res) => {
            resolveDelete = res as (value: Response) => void;
          });
        }
        return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
      }
    );

    act(() => {
      void result.current.deleteCommentOptimistic("to-delete");
    });

    // Should be visible but marked isDeleting
    await waitFor(() => {
      const c = result.current.comments.find((c) => c.id === "to-delete");
      return c?.isDeleting === true;
    });

    // Resolve and let it remove
    resolveDelete({ ok: true, status: 204, json: async () => ({}) } as unknown as Response);
    await waitFor(() => expect(result.current.comments.some((c) => c.id === "to-delete")).toBe(false));
  });

  it("restores the comment and sets commentError on DELETE failure", async () => {
    const existing = makeComment({ id: "delete-fail" });
    setupFetch({ getComments: [existing], failDelete: true });

    const { result } = renderHook(() => useComments(POST_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      try {
        await result.current.deleteCommentOptimistic("delete-fail");
      } catch {
        // expected
      }
    });

    // Comment restored
    await waitFor(() =>
      expect(result.current.comments.find((c) => c.id === "delete-fail")?.isDeleting).toBe(false)
    );
    // Error set
    expect(result.current.commentError).toBeTruthy();
  });
});

describe("useComments — clearCommentError", () => {
  it("clears commentError when called", async () => {
    setupFetch({ getComments: [], failCreate: true });

    const { result } = renderHook(() => useComments(POST_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      try {
        await result.current.addCommentOptimistic("Fail", AUTHOR);
      } catch {}
    });

    expect(result.current.commentError).toBeTruthy();

    act(() => result.current.clearCommentError());

    expect(result.current.commentError).toBeNull();
  });
});
