import {
  EMPTY_SNAPSHOT,
  FEED_PAGE_SIZE,
  WALLET_REQUIRED_MESSAGE,
  fetchFeedSnapshot,
  getFeedSnapshotPromise,
} from "../feed";

const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

afterEach(() => {
  mockFetch.mockReset();
});

function okJson(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

describe("fetchFeedSnapshot", () => {
  it("returns the For You page and reports more pages when full", async () => {
    const posts = Array.from({ length: FEED_PAGE_SIZE }, (_, i) => ({ id: String(i) }));
    mockFetch.mockResolvedValue(okJson({ posts, cursor: "next" }));

    const snapshot = await fetchFeedSnapshot("for-you", null);

    expect(snapshot.posts).toHaveLength(FEED_PAGE_SIZE);
    expect(snapshot.cursor).toBe("next");
    expect(snapshot.hasMore).toBe(true);
    expect(snapshot.error).toBeNull();
    expect(snapshot.pending).toBe(false);
  });

  it("never rejects — indexer failures are returned as an error snapshot", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

    const snapshot = await fetchFeedSnapshot("for-you", null);

    expect(snapshot.error).toBe("Indexer returned 503");
    expect(snapshot.posts).toEqual([]);
  });

  it("never rejects when the network throws", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));

    const snapshot = await fetchFeedSnapshot("for-you", null);

    expect(snapshot.error).toBe("network down");
  });

  it("asks for a wallet on the Following tab and skips the network", async () => {
    const snapshot = await fetchFeedSnapshot("following", null);

    expect(snapshot.error).toBe(WALLET_REQUIRED_MESSAGE);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("loads the merged Following feed in a single request", async () => {
    mockFetch.mockResolvedValue(okJson({ posts: [{ id: "1" }], cursor: null }));

    const snapshot = await fetchFeedSnapshot("following", "GADDRESS");

    expect(snapshot.posts).toEqual([{ id: "1" }]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(String(mockFetch.mock.calls[0][0])).toContain("/api/feed/following/GADDRESS");
  });

  it("falls back to per-author requests for legacy indexer responses", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (String(url).includes("/api/feed/following/")) {
        return okJson({ following: ["GA", "GB"], cursor: null });
      }
      return okJson({ posts: [{ id: String(url).includes("GA") ? "a" : "b", timestamp: 1 }] });
    });

    const snapshot = await fetchFeedSnapshot("following", "GADDRESS");

    expect(snapshot.posts.map((p) => p.id).sort()).toEqual(["a", "b"]);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("passes the cursor through when loading another page", async () => {
    mockFetch.mockResolvedValue(okJson({ posts: [], cursor: null }));

    await fetchFeedSnapshot("for-you", null, { cursor: "abc def" });

    expect(String(mockFetch.mock.calls[0][0])).toContain("cursor=abc%20def");
  });
});

describe("getFeedSnapshotPromise", () => {
  it("issues a real request in the browser", async () => {
    mockFetch.mockResolvedValue(okJson({ posts: [{ id: "1" }], cursor: null }));

    const snapshot = await getFeedSnapshotPromise("for-you", null);

    expect(snapshot.posts).toEqual([{ id: "1" }]);
    expect(EMPTY_SNAPSHOT.pending).toBe(false);
  });
});
